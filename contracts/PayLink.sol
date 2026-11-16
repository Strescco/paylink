// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Aevum PayLink — stablecoin invoice payments on Aevum testnet (tUSD8)
/// @notice Merchant creates an invoice, payer pays in tUSD8 into escrow,
///         merchant settles to withdraw, payer refunds if the merchant never
///         claims within the claim window. No owner, no admin, no fee.
/// @dev Written during the Aevum Builder Challenge #1 build window (from 16 Nov 2026 13:00 WIB).
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

    /// @notice Claim window after payment, after which the payer may refund.
    uint256 public constant CLAIM_WINDOW = 7 days;
    /// @notice Minimum / maximum invoice lifetime chosen at creation.
    uint256 public constant MIN_DURATION = 1 hours;
    uint256 public constant MAX_DURATION = 30 days;
    /// @notice Maximum memo length in bytes, to keep gas reasonable.
    uint256 public constant MAX_MEMO_BYTES = 200;

    /// @notice The tUSD8 token accepted by this contract (constructor parameter).
    IERC20 public immutable token;

    uint256 private _nextId = 1;
    mapping(uint256 => Invoice) private _invoices;

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

    error ZeroTokenAddress();
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

    constructor(address tokenAddress) {
        if (tokenAddress == address(0)) revert ZeroTokenAddress();
        token = IERC20(tokenAddress);
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

    /// @notice Pay an invoice in full. Funds move into escrow held by this contract.
    function payInvoice(uint256 invoiceId) external nonReentrant {
        Invoice storage inv = _invoices[invoiceId];
        if (inv.id == 0) revert InvoiceNotFound();
        if (inv.status != Status.Created) revert NotCreated();
        if (block.timestamp > inv.expiresAt) revert ExpiredInvoice();
        if (msg.sender == inv.merchant) revert MerchantCannotPay();
        if (inv.payer != address(0) && msg.sender != inv.payer) revert NotDesignatedPayer();

        // Effects before interaction (checks-effects-interactions).
        inv.status = Status.Paid;
        inv.paidAt = block.timestamp;
        inv.claimDeadline = block.timestamp + CLAIM_WINDOW;
        inv.paidBy = msg.sender;

        token.safeTransferFrom(msg.sender, address(this), inv.amount);

        emit InvoicePaid(invoiceId, msg.sender, inv.amount, inv.paidAt, inv.claimDeadline);
    }

    /// @notice Merchant withdraws escrowed funds for a paid invoice.
    function settleInvoice(uint256 invoiceId) external nonReentrant {
        Invoice storage inv = _invoices[invoiceId];
        if (inv.id == 0) revert InvoiceNotFound();
        if (msg.sender != inv.merchant) revert NotMerchant();
        if (inv.status != Status.Paid) revert NotPaid();

        // Status changes BEFORE the transfer (checks-effects-interactions).
        inv.status = Status.Settled;

        token.safeTransfer(inv.merchant, inv.amount);

        emit InvoiceSettled(invoiceId, inv.merchant, inv.amount);
    }

    /// @notice Payer refunds a paid invoice whose claim window has passed unsettled.
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

    /// @notice The id the next created invoice will receive.
    function nextInvoiceId() external view returns (uint256) {
        return _nextId;
    }
}
