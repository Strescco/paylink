// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AgentRegistry} from "./AgentRegistry.sol";

/// @title Aevum PayLink v2 — stablecoin invoices + agent-native payments
/// @notice Merchant creates an invoice, payer pays in tUSD8 into escrow,
///         merchant settles to withdraw, payer refunds if the merchant never
///         claims within the claim window.
/// @dev v2 adds, on top of the v1 invoice flow (unchanged):
///      - Agent approvals (session-key style, self-built on-chain): a merchant
///        approves an agent address with a per-agent tUSD8 spending cap and
///        expiry; the agent pays invoices within the cap; the merchant revokes
///        anytime. Least-privilege, spend caps, expiry, revocation — no QDay
///        infra needed, because QDay publishes no session-key / EntryPoint /
///        bundler address for Aevum testnet (wiki.qday.info FAQ §5.3).
///      - AgentRegistry reputation: when an invoice paid by a registered agent
///        settles, the registry records it (settled count + volume).
///      - Protocol fee: 0.5% (50 bps) of the invoice amount on settle,
///        sent to feeRecipient (the deployer). Merchant-visible in the UI
///        and in the FeeCollected event. Refunds are always fee-free and
///        return the FULL amount to the payer.
///      Design: ARCHITECTURE.md. Token address is a constructor parameter (not hardcoded).
contract PayLink is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Stored status. `Expired` is NEVER stored — it is only ever
    ///         returned by the `getInvoiceStatus` view when a Created invoice
    ///         has passed its `expiresAt`.
    enum Status {
        Created,
        Paid,
        Settled,
        Refunded,
        Cancelled,
        Expired
    }

    struct Invoice {
        uint256 id;
        address merchant;
        address payer; // address(0) = anyone may pay
        address token; // always the tUSD8 address passed to the constructor
        uint256 amount; // in the token's smallest unit
        string memo;
        uint256 createdAt;
        uint256 expiresAt;
        uint256 paidAt; // 0 until paid
        uint256 claimDeadline; // 0 until paid; then paidAt + CLAIM_WINDOW
        address paidBy; // address(0) until paid
        Status status;
    }

    /// @notice Per-merchant approval for one agent address (session-key style).
    struct AgentApproval {
        uint256 cap; // max total tUSD8 this agent may pay for this merchant
        uint256 spent; // tUSD8 already paid by this agent for this merchant
        uint256 expiry; // unix timestamp; approval is dead after this
        bool active; // false after revoke
    }

    /// @notice Claim window after payment, after which the payer may refund.
    uint256 public constant CLAIM_WINDOW = 7 days;
    /// @notice Minimum / maximum invoice lifetime chosen at creation.
    uint256 public constant MIN_DURATION = 1 hours;
    uint256 public constant MAX_DURATION = 30 days;
    /// @notice Maximum memo length in bytes, to keep gas reasonable.
    uint256 public constant MAX_MEMO_BYTES = 200;
    /// @notice Protocol fee on settle: 50 bps = 0.5% of the invoice amount.
    uint256 public constant FEE_BPS = 50;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    /// @notice Minimum / maximum agent-approval lifetime chosen at approval.
    uint256 public constant MIN_APPROVAL_DURATION = 1 hours;
    uint256 public constant MAX_APPROVAL_DURATION = 30 days;

    /// @notice The tUSD8 token accepted by this contract (constructor parameter).
    IERC20 public immutable token;
    /// @notice Agent identity + reputation registry (address(0) = none).
    AgentRegistry public immutable registry;
    /// @notice Receives the 0.5% protocol fee on every settle.
    address public immutable feeRecipient;

    uint256 private _nextId = 1;
    mapping(uint256 => Invoice) private _invoices;
    /// @notice merchant => agent => approval. A merchant approves an agent
    ///         with a spending cap + expiry, and may revoke it anytime.
    mapping(address => mapping(address => AgentApproval)) private _agentApprovals;

    event InvoiceCreated(
        uint256 indexed id,
        address indexed merchant,
        address indexed payer,
        address token,
        uint256 amount,
        uint256 expiresAt,
        string memo
    );
    event InvoicePaid(
        uint256 indexed id,
        address indexed paidBy,
        uint256 amount,
        uint256 paidAt,
        uint256 claimDeadline
    );
    event InvoiceSettled(uint256 indexed id, address indexed merchant, uint256 amount);
    event InvoiceRefunded(uint256 indexed id, address indexed paidBy, uint256 amount);
    event InvoiceCancelled(uint256 indexed id, address indexed merchant);
    /// @notice Emitted when a merchant approves an agent (cap + expiry).
    event AgentApproved(
        address indexed merchant,
        address indexed agent,
        uint256 cap,
        uint256 expiry
    );
    /// @notice Emitted when a merchant revokes an agent's approval.
    event AgentRevoked(address indexed merchant, address indexed agent);
    /// @notice Emitted when an approved agent pays within its cap.
    event AgentPaid(
        uint256 indexed id,
        address indexed agent,
        uint256 amount,
        uint256 spentAfter,
        uint256 cap
    );
    /// @notice Emitted on every settle: the 0.5% protocol fee.
    event FeeCollected(
        uint256 indexed id, address indexed feeRecipient, uint256 fee
    );

    error ZeroTokenAddress();
    error ZeroFeeRecipient();
    error ZeroAmount();
    error DurationOutOfRange();
    error MemoTooLong();
    error InvoiceNotFound();
    error NotCreated();
    error NotPaid();
    error ExpiredInvoice();
    error NotDesignatedPayer();
    error MerchantCannotPay();
    error NotMerchant();
    error NotPayer();
    error ClaimWindowNotOver();
    error ZeroAgentAddress();
    error ZeroCap();
    error AgentNotApproved();
    error AgentApprovalExpired();
    error AgentCapExceeded();

    constructor(address tokenAddress, address registryAddress, address feeRecipientAddress) {
        if (tokenAddress == address(0)) revert ZeroTokenAddress();
        if (feeRecipientAddress == address(0)) revert ZeroFeeRecipient();
        token = IERC20(tokenAddress);
        registry = AgentRegistry(registryAddress);
        feeRecipient = feeRecipientAddress;
    }

    /// @notice Create a new invoice. Returns the new invoice id (starting at 1).
    /// @param payer The designated payer, or address(0) for an open invoice.
    /// @param amount Amount in the token's smallest unit; must be > 0.
    /// @param expiresIn Lifetime in seconds; between 1 hour and 30 days.
    /// @param memo Short note, max 200 bytes.
    function createInvoice(
        address payer,
        uint256 amount,
        uint256 expiresIn,
        string calldata memo
    ) external returns (uint256 invoiceId) {
        if (amount == 0) revert ZeroAmount();
        if (expiresIn < MIN_DURATION || expiresIn > MAX_DURATION) revert DurationOutOfRange();
        if (bytes(memo).length > MAX_MEMO_BYTES) revert MemoTooLong();

        invoiceId = _nextId;
        unchecked {
            _nextId = invoiceId + 1;
        }

        _invoices[invoiceId] = Invoice({
            id: invoiceId,
            merchant: msg.sender,
            payer: payer,
            token: address(token),
            amount: amount,
            memo: memo,
            createdAt: block.timestamp,
            expiresAt: block.timestamp + expiresIn,
            paidAt: 0,
            claimDeadline: 0,
            paidBy: address(0),
            status: Status.Created
        });

        emit InvoiceCreated(
            invoiceId, msg.sender, payer, address(token), amount, block.timestamp + expiresIn, memo
        );
    }

    /// @notice Approve an agent to pay this merchant's invoices, up to `cap`
    ///         total tUSD8, until `expiry`. Re-approving resets `spent` to 0.
    /// @dev This is the on-chain session-key / spending-cap primitive:
    ///      least-privilege (per agent, per merchant), capped, expiring,
    ///      revocable. The agent pays with its own wallet — no QDay infra.
    /// @param agent The agent's wallet address.
    /// @param cap Max total tUSD8 the agent may pay for this merchant.
    /// @param expiresIn Approval lifetime in seconds; 1 hour – 30 days.
    function approveAgent(address agent, uint256 cap, uint256 expiresIn) external {
        if (agent == address(0)) revert ZeroAgentAddress();
        if (cap == 0) revert ZeroCap();
        if (expiresIn < MIN_APPROVAL_DURATION || expiresIn > MAX_APPROVAL_DURATION) {
            revert DurationOutOfRange();
        }

        uint256 expiry = block.timestamp + expiresIn;
        _agentApprovals[msg.sender][agent] = AgentApproval({
            cap: cap,
            spent: 0,
            expiry: expiry,
            active: true
        });

        emit AgentApproved(msg.sender, agent, cap, expiry);
    }

    /// @notice Revoke an agent's approval. The agent can no longer pay this
    ///         merchant's invoices (until re-approved). `spent` is kept as a
    ///         record; re-approving resets it to 0.
    function revokeAgent(address agent) external {
        AgentApproval storage ap = _agentApprovals[msg.sender][agent];
        if (ap.cap == 0 || !ap.active) revert AgentNotApproved();
        ap.active = false;
        emit AgentRevoked(msg.sender, agent);
    }

    /// @notice The merchant's current approval for an agent (cap 0 = never approved).
    function getAgentApproval(address merchant, address agent)
        external
        view
        returns (AgentApproval memory)
    {
        return _agentApprovals[merchant][agent];
    }

    /// @notice Pay an invoice in full. Funds move into escrow held by this contract.
    /// @dev If the merchant has an approval record for the payer (cap > 0),
    ///      the payment is treated as an AGENT payment: the approval must be
    ///      active and unexpired, and spent + amount must stay within the cap.
    ///      A payer with no approval record pays as a normal human — v1 behavior.
    function payInvoice(uint256 invoiceId) external nonReentrant {
        Invoice storage inv = _invoices[invoiceId];
        if (inv.id == 0) revert InvoiceNotFound();
        if (inv.status != Status.Created) revert NotCreated();
        if (block.timestamp > inv.expiresAt) revert ExpiredInvoice();
        if (msg.sender == inv.merchant) revert MerchantCannotPay();
        if (inv.payer != address(0) && msg.sender != inv.payer) revert NotDesignatedPayer();

        // Agent path: merchant has an approval record for this payer.
        AgentApproval storage ap = _agentApprovals[inv.merchant][msg.sender];
        bool isAgentPayment = ap.cap > 0;
        if (isAgentPayment) {
            if (!ap.active) revert AgentNotApproved();
            if (block.timestamp > ap.expiry) revert AgentApprovalExpired();
            if (ap.spent + inv.amount > ap.cap) revert AgentCapExceeded();
            ap.spent += inv.amount;
        }

        // Effects before interaction (checks-effects-interactions).
        inv.status = Status.Paid;
        inv.paidAt = block.timestamp;
        inv.claimDeadline = block.timestamp + CLAIM_WINDOW;
        inv.paidBy = msg.sender;

        token.safeTransferFrom(msg.sender, address(this), inv.amount);

        emit InvoicePaid(invoiceId, msg.sender, inv.amount, inv.paidAt, inv.claimDeadline);
        if (isAgentPayment) {
            emit AgentPaid(invoiceId, msg.sender, inv.amount, ap.spent, ap.cap);
        }
    }

    /// @notice Merchant withdraws escrowed funds for a paid invoice.
    /// @dev The 0.5% protocol fee goes to feeRecipient; the merchant receives
    ///      amount - fee. If the payer is a registered agent, the registry is
    ///      notified (reputation) — a registry failure never blocks settlement.
    function settleInvoice(uint256 invoiceId) external nonReentrant {
        Invoice storage inv = _invoices[invoiceId];
        if (inv.id == 0) revert InvoiceNotFound();
        if (msg.sender != inv.merchant) revert NotMerchant();
        if (inv.status != Status.Paid) revert NotPaid();

        // Status changes BEFORE the transfers (checks-effects-interactions).
        inv.status = Status.Settled;

        uint256 fee = (inv.amount * FEE_BPS) / BPS_DENOMINATOR;
        uint256 merchantAmount = inv.amount - fee;

        if (fee > 0) {
            token.safeTransfer(feeRecipient, fee);
            emit FeeCollected(invoiceId, feeRecipient, fee);
        }
        token.safeTransfer(inv.merchant, merchantAmount);

        emit InvoiceSettled(invoiceId, inv.merchant, inv.amount);

        // Reputation: only for registered agents, and never blocking.
        if (address(registry) != address(0) && registry.isRegistered(inv.paidBy)) {
            try registry.recordSettlement(inv.paidBy, inv.amount) {} catch {}
        }
    }

    /// @notice Payer refunds a paid invoice whose claim window has passed unsettled.
    /// @dev Refunds are always fee-free: the FULL amount returns to the payer.
    function refundInvoice(uint256 invoiceId) external nonReentrant {
        Invoice storage inv = _invoices[invoiceId];
        if (inv.id == 0) revert InvoiceNotFound();
        if (msg.sender != inv.paidBy) revert NotPayer();
        if (inv.status != Status.Paid) revert NotPaid();
        if (block.timestamp <= inv.claimDeadline) revert ClaimWindowNotOver();

        // Status changes BEFORE the transfer (checks-effects-interactions).
        inv.status = Status.Refunded;

        token.safeTransfer(inv.paidBy, inv.amount);

        emit InvoiceRefunded(invoiceId, inv.paidBy, inv.amount);
    }

    /// @notice Merchant cancels an unpaid invoice. No funds ever move.
    function cancelInvoice(uint256 invoiceId) external {
        Invoice storage inv = _invoices[invoiceId];
        if (inv.id == 0) revert InvoiceNotFound();
        if (msg.sender != inv.merchant) revert NotMerchant();
        if (inv.status != Status.Created) revert NotCreated();

        inv.status = Status.Cancelled;

        emit InvoiceCancelled(invoiceId, inv.merchant);
    }

    /// @notice Full invoice data (stored status; never Expired — see getInvoiceStatus).
    function getInvoice(uint256 invoiceId) external view returns (Invoice memory) {
        Invoice memory inv = _invoices[invoiceId];
        if (inv.id == 0) revert InvoiceNotFound();
        return inv;
    }

    /// @notice Effective status: a Created invoice past its expiry reads as Expired.
    function getInvoiceStatus(uint256 invoiceId) external view returns (Status) {
        Invoice memory inv = _invoices[invoiceId];
        if (inv.id == 0) revert InvoiceNotFound();
        if (inv.status == Status.Created && block.timestamp > inv.expiresAt) {
            return Status.Expired;
        }
        return inv.status;
    }

    /// @notice True when a Created invoice has passed its payment deadline.
    function isExpired(uint256 invoiceId) external view returns (bool) {
        Invoice memory inv = _invoices[invoiceId];
        if (inv.id == 0) revert InvoiceNotFound();
        return inv.status == Status.Created && block.timestamp > inv.expiresAt;
    }

    /// @notice The protocol fee (in token base units) for a given invoice amount.
    function feeFor(uint256 amount) external pure returns (uint256) {
        return (amount * FEE_BPS) / BPS_DENOMINATOR;
    }

    /// @notice The id the next created invoice will receive.
    function nextInvoiceId() external view returns (uint256) {
        return _nextId;
    }
}
