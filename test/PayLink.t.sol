// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {PayLink} from "../contracts/PayLink.sol";
import {MockTUSD8} from "../contracts/mocks/MockTUSD8.sol";

/// @notice Test suite for Aevum PayLink — the 38 cases from ARCHITECTURE.md §5.
///         Amounts are in tUSD8 base units (6 decimals): 10 tUSD8 = 10_000_000.
contract PayLinkTest is Test {
    PayLink internal payLink;
    MockTUSD8 internal token;

    address internal merchant = makeAddr("merchant");
    address internal payer = makeAddr("payer");
    address internal other = makeAddr("other");

    uint256 internal constant TEN = 10_000_000; // 10 tUSD8
    uint256 internal constant FIVE = 5_000_000; // 5 tUSD8
    uint256 internal constant DAY = 1 days;

    function setUp() public {
        token = new MockTUSD8();
        payLink = new PayLink(address(token));
        token.mint(payer, 1_000_000_000_000); // 1,000,000 tUSD8
        token.mint(other, 1_000_000_000_000);
        token.mint(merchant, 1_000_000_000_000);
    }

    // ---- helpers ----

    function _create(
        address payerAddr,
        uint256 amount,
        uint256 expiresIn,
        string memory memo
    ) internal returns (uint256 id) {
        vm.prank(merchant);
        id = payLink.createInvoice(payerAddr, amount, expiresIn, memo);
    }

    function _createDefault() internal returns (uint256 id) {
        return _create(payer, TEN, DAY, "Design logo - paket standar");
    }

    function _pay(uint256 id, address from) internal {
        vm.startPrank(from);
        token.approve(address(payLink), type(uint256).max);
        payLink.payInvoice(id);
        vm.stopPrank();
    }

    function _payDefault(uint256 id) internal {
        _pay(id, payer);
    }

    // ---- §5.1 createInvoice (cases 1-7) ----

    function test_01_Create_Success_FieldsAndIds() public {
        uint256 id = _createDefault();
        assertEq(id, 1);

        PayLink.Invoice memory inv = payLink.getInvoice(1);
        assertEq(inv.id, 1);
        assertEq(inv.merchant, merchant);
        assertEq(inv.payer, payer);
        assertEq(inv.token, address(token));
        assertEq(inv.amount, TEN);
        assertEq(inv.memo, "Design logo - paket standar");
        assertEq(inv.createdAt, block.timestamp);
        assertEq(inv.expiresAt, block.timestamp + DAY);
        assertEq(inv.paidAt, 0);
        assertEq(inv.claimDeadline, 0);
        assertEq(inv.paidBy, address(0));
        assertEq(uint256(inv.status), uint256(PayLink.Status.Created));
    }

    function test_02_Create_EmitsInvoiceCreated() public {
        vm.expectEmit(true, true, true, true);
        emit PayLink.InvoiceCreated(
            1, merchant, payer, address(token), TEN, block.timestamp + DAY, "Design logo"
        );
        vm.prank(merchant);
        payLink.createInvoice(payer, TEN, DAY, "Design logo");
    }

    function test_03_Create_RevertsZeroAmount() public {
        vm.prank(merchant);
        vm.expectRevert(PayLink.ZeroAmount.selector);
        payLink.createInvoice(payer, 0, DAY, "x");
    }

    function test_04_Create_RevertsDurationOutOfRange() public {
        vm.startPrank(merchant);
        vm.expectRevert(PayLink.DurationOutOfRange.selector);
        payLink.createInvoice(payer, TEN, 1 hours - 1, "x");
        vm.expectRevert(PayLink.DurationOutOfRange.selector);
        payLink.createInvoice(payer, TEN, 30 days + 1, "x");
        vm.stopPrank();
    }

    function test_05_Create_RevertsMemoTooLong() public {
        string memory longMemo = new string(201);
        vm.prank(merchant);
        vm.expectRevert(PayLink.MemoTooLong.selector);
        payLink.createInvoice(payer, TEN, DAY, longMemo);
    }

    function test_06_Create_OpenInvoiceZeroPayer() public {
        uint256 id = _create(address(0), FIVE, DAY, "open");
        PayLink.Invoice memory inv = payLink.getInvoice(id);
        assertEq(inv.payer, address(0));
    }

    function test_07_Create_TwoInvoicesDifferentIds() public {
        uint256 a = _createDefault();
        uint256 b = _createDefault();
        assertEq(a, 1);
        assertEq(b, 2);
        assertEq(payLink.nextInvoiceId(), 3);
    }

    // ---- §5.2 payInvoice (cases 8-17) ----

    function test_08_Pay_Success_StateEscrowEvent() public {
        uint256 id = _createDefault();
        // Approve first: approve() emits Approval, which would otherwise be
        // the "next event" vm.expectEmit checks against.
        vm.prank(payer);
        token.approve(address(payLink), type(uint256).max);
        vm.expectEmit(true, true, false, true);
        emit PayLink.InvoicePaid(id, payer, TEN, block.timestamp, block.timestamp + 7 days);
        vm.prank(payer);
        payLink.payInvoice(id);

        PayLink.Invoice memory inv = payLink.getInvoice(id);
        assertEq(uint256(inv.status), uint256(PayLink.Status.Paid));
        assertEq(inv.paidAt, block.timestamp);
        assertEq(inv.claimDeadline, block.timestamp + 7 days);
        assertEq(inv.paidBy, payer);
        assertEq(token.balanceOf(address(payLink)), TEN);
        assertEq(token.balanceOf(payer), 1_000_000_000_000 - TEN);
    }

    function test_09_Pay_RevertsNonexistent() public {
        vm.prank(payer);
        vm.expectRevert(PayLink.InvoiceNotFound.selector);
        payLink.payInvoice(999);
    }

    function test_10_Pay_RevertsDoublePay() public {
        uint256 id = _createDefault();
        _payDefault(id);
        vm.prank(payer);
        vm.expectRevert(PayLink.NotCreated.selector);
        payLink.payInvoice(id);
    }

    function test_11_Pay_RevertsCancelled() public {
        uint256 id = _createDefault();
        vm.prank(merchant);
        payLink.cancelInvoice(id);
        vm.prank(payer);
        vm.expectRevert(PayLink.NotCreated.selector);
        payLink.payInvoice(id);
    }

    function test_12_Pay_RevertsExpired() public {
        uint256 id = _create(payer, TEN, 1 hours, "short");
        vm.warp(block.timestamp + 1 hours + 1);
        vm.prank(payer);
        vm.expectRevert(PayLink.ExpiredInvoice.selector);
        payLink.payInvoice(id);
    }

    function test_13_Pay_RevertsWrongPayer() public {
        uint256 id = _createDefault();
        vm.startPrank(other);
        token.approve(address(payLink), TEN);
        vm.expectRevert(PayLink.NotDesignatedPayer.selector);
        payLink.payInvoice(id);
        vm.stopPrank();
    }

    function test_14_Pay_RevertsInsufficientAllowance() public {
        uint256 id = _createDefault();
        vm.startPrank(payer);
        token.approve(address(payLink), TEN - 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector, address(payLink), TEN - 1, TEN
            )
        );
        payLink.payInvoice(id);
        vm.stopPrank();
    }

    function test_15_Pay_RevertsInsufficientBalance() public {
        address poor = makeAddr("poor");
        uint256 id = _create(poor, TEN, DAY, "poor payer");
        vm.startPrank(poor);
        token.approve(address(payLink), TEN);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientBalance.selector, poor, 0, TEN
            )
        );
        payLink.payInvoice(id);
        vm.stopPrank();
    }

    function test_16_Pay_RevertsMerchantSelfPay() public {
        uint256 id = _createDefault();
        vm.startPrank(merchant);
        token.approve(address(payLink), TEN);
        vm.expectRevert(PayLink.MerchantCannotPay.selector);
        payLink.payInvoice(id);
        vm.stopPrank();
    }

    function test_17_Pay_OpenInvoiceAnyoneExceptMerchant() public {
        uint256 id = _create(address(0), FIVE, DAY, "open");
        _pay(id, other);
        assertEq(uint256(payLink.getInvoice(id).status), uint256(PayLink.Status.Paid));

        uint256 id2 = _create(address(0), FIVE, DAY, "open 2");
        vm.startPrank(merchant);
        token.approve(address(payLink), FIVE);
        vm.expectRevert(PayLink.MerchantCannotPay.selector);
        payLink.payInvoice(id2);
        vm.stopPrank();
    }

    // ---- §5.3 settleInvoice (cases 18-22) ----

    function test_18_Settle_Success() public {
        uint256 id = _createDefault();
        _payDefault(id);
        uint256 before = token.balanceOf(merchant);
        vm.expectEmit(true, true, false, true);
        emit PayLink.InvoiceSettled(id, merchant, TEN);
        vm.prank(merchant);
        payLink.settleInvoice(id);

        assertEq(uint256(payLink.getInvoice(id).status), uint256(PayLink.Status.Settled));
        assertEq(token.balanceOf(merchant), before + TEN);
        assertEq(token.balanceOf(address(payLink)), 0);
    }

    function test_19_Settle_RevertsNotMerchant() public {
        uint256 id = _createDefault();
        _payDefault(id);
        vm.prank(payer);
        vm.expectRevert(PayLink.NotMerchant.selector);
        payLink.settleInvoice(id);
    }

    function test_20_Settle_RevertsNotPaid() public {
        uint256 id = _createDefault();
        vm.prank(merchant);
        vm.expectRevert(PayLink.NotPaid.selector);
        payLink.settleInvoice(id);
    }

    function test_21_Settle_RevertsDoubleSettle() public {
        uint256 id = _createDefault();
        _payDefault(id);
        vm.prank(merchant);
        payLink.settleInvoice(id);
        vm.prank(merchant);
        vm.expectRevert(PayLink.NotPaid.selector);
        payLink.settleInvoice(id);
    }

    function test_22_Settle_RevertsAfterRefund() public {
        uint256 id = _createDefault();
        _payDefault(id);
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(payer);
        payLink.refundInvoice(id);
        vm.prank(merchant);
        vm.expectRevert(PayLink.NotPaid.selector);
        payLink.settleInvoice(id);
    }

    // ---- §5.4 refundInvoice (cases 23-27) ----

    function test_23_Refund_SuccessAfterClaimDeadline() public {
        uint256 id = _createDefault();
        _payDefault(id);
        vm.warp(block.timestamp + 7 days + 1);
        uint256 before = token.balanceOf(payer);
        vm.expectEmit(true, true, false, true);
        emit PayLink.InvoiceRefunded(id, payer, TEN);
        vm.prank(payer);
        payLink.refundInvoice(id);

        assertEq(uint256(payLink.getInvoice(id).status), uint256(PayLink.Status.Refunded));
        assertEq(token.balanceOf(payer), before + TEN);
        assertEq(token.balanceOf(address(payLink)), 0);
    }

    function test_24_Refund_RevertsBeforeClaimDeadline() public {
        uint256 id = _createDefault();
        _payDefault(id);
        vm.warp(block.timestamp + 7 days - 1);
        vm.prank(payer);
        vm.expectRevert(PayLink.ClaimWindowNotOver.selector);
        payLink.refundInvoice(id);
    }

    function test_25_Refund_RevertsNotPaidBy() public {
        uint256 id = _createDefault();
        _payDefault(id);
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(other);
        vm.expectRevert(PayLink.NotPayer.selector);
        payLink.refundInvoice(id);
    }

    function test_26_Refund_RevertsNotPaid() public {
        uint256 id = _createDefault();
        // Created (never paid): paidBy is address(0); use merchant as caller
        // to hit the NotPaid check after passing the NotPayer check is impossible
        // for address(0), so instead refund a Settled invoice.
        _payDefault(id);
        vm.prank(merchant);
        payLink.settleInvoice(id);
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(payer);
        vm.expectRevert(PayLink.NotPaid.selector);
        payLink.refundInvoice(id);
    }

    function test_27_Refund_ThenSettleReverts() public {
        uint256 id = _createDefault();
        _payDefault(id);
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(payer);
        payLink.refundInvoice(id);
        vm.prank(merchant);
        vm.expectRevert(PayLink.NotPaid.selector);
        payLink.settleInvoice(id);
    }

    // ---- §5.5 cancelInvoice (cases 28-31) ----

    function test_28_Cancel_Success() public {
        uint256 id = _createDefault();
        vm.expectEmit(true, true, false, true);
        emit PayLink.InvoiceCancelled(id, merchant);
        vm.prank(merchant);
        payLink.cancelInvoice(id);
        assertEq(uint256(payLink.getInvoice(id).status), uint256(PayLink.Status.Cancelled));
    }

    function test_29_Cancel_RevertsNotMerchant() public {
        uint256 id = _createDefault();
        vm.prank(payer);
        vm.expectRevert(PayLink.NotMerchant.selector);
        payLink.cancelInvoice(id);
    }

    function test_30_Cancel_RevertsAfterPaid() public {
        uint256 id = _createDefault();
        _payDefault(id);
        vm.prank(merchant);
        vm.expectRevert(PayLink.NotCreated.selector);
        payLink.cancelInvoice(id);
    }

    function test_31_CancelledCannotBePaid() public {
        uint256 id = _createDefault();
        vm.prank(merchant);
        payLink.cancelInvoice(id);
        vm.prank(payer);
        vm.expectRevert(PayLink.NotCreated.selector);
        payLink.payInvoice(id);
    }

    // ---- §5.6 views (cases 32-35) ----

    function test_32_GetInvoice_FieldsAndRevertsUnknown() public {
        uint256 id = _createDefault();
        PayLink.Invoice memory inv = payLink.getInvoice(id);
        assertEq(inv.amount, TEN);
        vm.expectRevert(PayLink.InvoiceNotFound.selector);
        payLink.getInvoice(999);
    }

    function test_33_GetInvoiceStatus_ExpiredComputed() public {
        uint256 id = _create(payer, TEN, 1 hours, "short");
        assertEq(uint256(payLink.getInvoiceStatus(id)), uint256(PayLink.Status.Created));
        vm.warp(block.timestamp + 1 hours + 1);
        // No transaction happened — expiry is computed by the view.
        assertEq(uint256(payLink.getInvoiceStatus(id)), uint256(PayLink.Status.Expired));
        // Stored status is still Created (expiry is never written to storage).
        assertEq(uint256(payLink.getInvoice(id).status), uint256(PayLink.Status.Created));
    }

    function test_34_IsExpired_BeforeAndAfter() public {
        uint256 id = _create(payer, TEN, 1 hours, "short");
        assertFalse(payLink.isExpired(id));
        vm.warp(block.timestamp + 1 hours + 1);
        assertTrue(payLink.isExpired(id));
    }

    function test_35_NextInvoiceId_Increments() public {
        assertEq(payLink.nextInvoiceId(), 1);
        _createDefault();
        assertEq(payLink.nextInvoiceId(), 2);
        _createDefault();
        assertEq(payLink.nextInvoiceId(), 3);
    }

    // ---- §5.7 fuzz + reentrancy (cases 36-38) ----

    function testFuzz_36_PaySettleExactAmount(uint256 amount) public {
        amount = bound(amount, 1, 1_000_000_000_000);
        uint256 id = _create(payer, amount, DAY, "fuzz");
        _pay(id, payer);
        uint256 merchantBefore = token.balanceOf(merchant);
        vm.prank(merchant);
        payLink.settleInvoice(id);
        assertEq(token.balanceOf(merchant), merchantBefore + amount);
        assertEq(token.balanceOf(address(payLink)), 0);
    }

    function testFuzz_37_ExpiryDuration(uint32 durationSeconds) public {
        uint256 duration = bound(uint256(durationSeconds), 1 hours, 30 days);
        uint256 createdAt = block.timestamp;
        uint256 id = _create(payer, TEN, duration, "fuzz duration");
        assertEq(payLink.getInvoice(id).expiresAt, createdAt + duration);
    }

    function test_38_Reentrancy_SettleResistsAttack() public {
        Attacker attacker = new Attacker();
        EvilToken evil = new EvilToken();
        PayLink evilLink = new PayLink(address(evil));

        // Attacker (as merchant) creates an invoice; payer pays with the evil token.
        evil.mint(payer, TEN);
        vm.prank(address(attacker));
        uint256 id = evilLink.createInvoice(payer, TEN, DAY, "attack");
        evil.setTarget(address(evilLink), id);

        vm.startPrank(payer);
        evil.approve(address(evilLink), TEN);
        evilLink.payInvoice(id);
        vm.stopPrank();

        // Attacker settles; the token transfer tries to reenter settleInvoice.
        // ReentrancyGuard blocks the inner call; the outer call pays exactly once.
        attacker.settle(address(evilLink), id);
        assertEq(evil.balanceOf(address(attacker)), TEN);
        assertEq(evil.balanceOf(address(evilLink)), 0);
        assertEq(uint256(evilLink.getInvoice(id).status), uint256(PayLink.Status.Settled));
    }
}

/// @notice ERC-20 that tries to reenter PayLink.settleInvoice during transfer.
contract EvilToken {
    string public name = "EVIL";
    string public symbol = "EVIL";
    uint8 public decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    PayLink public target;
    uint256 public targetId;
    bool public attacked;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    function setTarget(address t, uint256 id) external {
        target = PayLink(t);
        targetId = id;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (address(target) != address(0) && !attacked) {
            attacked = true;
            try target.settleInvoice(targetId) {} catch {}
        }
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient");
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

/// @notice Minimal merchant contract used by the reentrancy test.
contract Attacker {
    function settle(address payLink, uint256 id) external {
        PayLink(payLink).settleInvoice(id);
    }
}
