// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PayLink} from "../contracts/PayLink.sol";
import {AgentRegistry} from "../contracts/AgentRegistry.sol";
import {MockTUSD8} from "../contracts/mocks/MockTUSD8.sol";

/// @notice Test suite for PayLink v2 — agent approvals, registry reputation, fee.
///         Amounts in tUSD8 base units (6 decimals): 10 tUSD8 = 10_000_000.
contract PayLinkV2Test is Test {
    PayLink internal payLink;
    AgentRegistry internal registry;
    MockTUSD8 internal token;

    address internal merchant = makeAddr("merchant");
    address internal agent = makeAddr("agent");
    address internal payer = makeAddr("payer");
    address internal other = makeAddr("other");
    address internal feeCollector = makeAddr("feeCollector");

    uint256 internal constant TEN = 10_000_000; // 10 tUSD8
    uint256 internal constant ONE = 1_000_000; // 1 tUSD8
    uint256 internal constant DAY = 1 days;
    uint256 internal constant WEEK = 7 days;

    function setUp() public {
        token = new MockTUSD8();
        registry = new AgentRegistry();
        payLink = new PayLink(address(token), address(registry), feeCollector);
        // Authorize this PayLink in the registry (deployer = this test contract).
        registry.authorizePayLink(address(payLink), true);

        token.mint(payer, 1_000_000_000_000);
        token.mint(agent, 1_000_000_000_000);
        token.mint(other, 1_000_000_000_000);
        token.mint(merchant, 1_000_000_000_000);
    }

    // ---- helpers ----

    function _create(address payerAddr, uint256 amount) internal returns (uint256 id) {
        vm.prank(merchant);
        id = payLink.createInvoice(payerAddr, amount, DAY, "agent job");
    }

    function _approve(address agentAddr, uint256 cap, uint256 duration) internal {
        vm.prank(merchant);
        payLink.approveAgent(agentAddr, cap, duration);
    }

    function _pay(uint256 id, address from) internal {
        vm.startPrank(from);
        token.approve(address(payLink), type(uint256).max);
        payLink.payInvoice(id);
        vm.stopPrank();
    }

    function _payAndSettle(uint256 id, address from) internal {
        _pay(id, from);
        vm.prank(merchant);
        payLink.settleInvoice(id);
    }

    // ---- constructor ----

    function test_C1_Constructor_StoresParams() public view {
        assertEq(address(payLink.token()), address(token));
        assertEq(address(payLink.registry()), address(registry));
        assertEq(payLink.feeRecipient(), feeCollector);
        assertEq(payLink.FEE_BPS(), 50);
    }

    function test_C2_Constructor_RevertsZeroToken() public {
        vm.expectRevert(PayLink.ZeroTokenAddress.selector);
        new PayLink(address(0), address(registry), feeCollector);
    }

    function test_C3_Constructor_RevertsZeroFeeRecipient() public {
        vm.expectRevert(PayLink.ZeroFeeRecipient.selector);
        new PayLink(address(token), address(registry), address(0));
    }

    function test_C4_Constructor_RegistryMayBeZero() public {
        PayLink noReg = new PayLink(address(token), address(0), feeCollector);
        assertEq(address(noReg.registry()), address(0));
    }

    // ---- registry ----

    function test_R1_Register_Success() public {
        vm.prank(agent);
        registry.registerAgent("InvoiceBot-01", "ipfs://metadata");
        assertTrue(registry.isRegistered(agent));

        AgentRegistry.Agent memory a = registry.getAgent(agent);
        assertEq(a.owner, agent);
        assertEq(a.name, "InvoiceBot-01");
        assertEq(a.metadataURI, "ipfs://metadata");
        assertEq(a.settledCount, 0);
        assertEq(a.settledVolume, 0);
        assertTrue(a.exists);
    }

    function test_R2_Register_RevertsDouble() public {
        vm.prank(agent);
        registry.registerAgent("Bot", "");
        vm.prank(agent);
        vm.expectRevert(AgentRegistry.AlreadyRegistered.selector);
        registry.registerAgent("Bot2", "");
    }

    function test_R3_Register_RevertsEmptyName() public {
        vm.prank(agent);
        vm.expectRevert(AgentRegistry.EmptyName.selector);
        registry.registerAgent("", "");
    }

    function test_R4_RecordSettlement_RevertsUnauthorized() public {
        vm.prank(agent);
        registry.registerAgent("Bot", "");
        vm.expectRevert(AgentRegistry.NotAuthorizedPayLink.selector);
        registry.recordSettlement(agent, TEN);
    }

    function test_R5_AuthorizePayLink_OnlyOwner() public {
        vm.prank(other);
        vm.expectRevert(AgentRegistry.NotOwner.selector);
        registry.authorizePayLink(address(payLink), false);
    }

    function test_R6_GetAgent_RevertsUnregistered() public {
        vm.expectRevert(AgentRegistry.AgentNotRegistered.selector);
        registry.getAgent(agent);
        vm.expectRevert(AgentRegistry.AgentNotRegistered.selector);
        registry.reputation(agent);
    }

    // ---- approvals ----

    function test_A1_Approve_SuccessAndFields() public {
        vm.expectEmit(true, true, false, true);
        emit PayLink.AgentApproved(merchant, agent, 2 * ONE, block.timestamp + WEEK);
        vm.prank(merchant);
        payLink.approveAgent(agent, 2 * ONE, WEEK);

        PayLink.AgentApproval memory ap = payLink.getAgentApproval(merchant, agent);
        assertEq(ap.cap, 2 * ONE);
        assertEq(ap.spent, 0);
        assertEq(ap.expiry, block.timestamp + WEEK);
        assertTrue(ap.active);
    }

    function test_A2_Approve_RevertsBadArgs() public {
        vm.startPrank(merchant);
        vm.expectRevert(PayLink.ZeroAgentAddress.selector);
        payLink.approveAgent(address(0), ONE, DAY);
        vm.expectRevert(PayLink.ZeroCap.selector);
        payLink.approveAgent(agent, 0, DAY);
        vm.expectRevert(PayLink.DurationOutOfRange.selector);
        payLink.approveAgent(agent, ONE, 1 hours - 1);
        vm.expectRevert(PayLink.DurationOutOfRange.selector);
        payLink.approveAgent(agent, ONE, 30 days + 1);
        vm.stopPrank();
    }

    function test_A3_Revoke_SuccessAndBlocks() public {
        _approve(agent, 2 * ONE, WEEK);
        vm.expectEmit(true, true, false, true);
        emit PayLink.AgentRevoked(merchant, agent);
        vm.prank(merchant);
        payLink.revokeAgent(agent);

        assertFalse(payLink.getAgentApproval(merchant, agent).active);
        // Second revoke reverts.
        vm.prank(merchant);
        vm.expectRevert(PayLink.AgentNotApproved.selector);
        payLink.revokeAgent(agent);
    }

    function test_A4_Revoke_RevertsNeverApproved() public {
        vm.prank(merchant);
        vm.expectRevert(PayLink.AgentNotApproved.selector);
        payLink.revokeAgent(agent);
    }

    function test_A5_Reapprove_ResetsSpent() public {
        _approve(agent, ONE, WEEK);
        uint256 id = _create(agent, ONE);
        _pay(id, agent);
        assertEq(payLink.getAgentApproval(merchant, agent).spent, ONE);
        // Re-approve: fresh allowance, spent back to 0.
        _approve(agent, 2 * ONE, WEEK);
        PayLink.AgentApproval memory ap = payLink.getAgentApproval(merchant, agent);
        assertEq(ap.cap, 2 * ONE);
        assertEq(ap.spent, 0);
        assertTrue(ap.active);
    }

    // ---- agent payments ----

    function test_P1_AgentPays_WithinCap_TracksSpent() public {
        _approve(agent, 2 * ONE, WEEK);
        uint256 id = _create(agent, ONE);
        // Approve first: approve() emits Approval, which would otherwise be
        // the "next event" vm.expectEmit checks against.
        vm.prank(agent);
        token.approve(address(payLink), type(uint256).max);
        vm.expectEmit(true, true, false, true);
        emit PayLink.AgentPaid(id, agent, ONE, ONE, 2 * ONE);
        vm.prank(agent);
        payLink.payInvoice(id);

        assertEq(uint256(payLink.getInvoice(id).status), uint256(PayLink.Status.Paid));
        assertEq(payLink.getAgentApproval(merchant, agent).spent, ONE);
        assertEq(token.balanceOf(address(payLink)), ONE);
    }

    function test_P2_AgentPays_UpToCapThenReverts() public {
        _approve(agent, 2 * ONE, WEEK);
        uint256 id1 = _create(agent, ONE);
        uint256 id2 = _create(agent, ONE);
        uint256 id3 = _create(agent, ONE);
        _pay(id1, agent);
        _pay(id2, agent); // spent == cap exactly: allowed
        assertEq(payLink.getAgentApproval(merchant, agent).spent, 2 * ONE);

        vm.startPrank(agent);
        token.approve(address(payLink), ONE);
        vm.expectRevert(PayLink.AgentCapExceeded.selector);
        payLink.payInvoice(id3);
        vm.stopPrank();
    }

    function test_P3_RevokedAgent_CannotPay() public {
        _approve(agent, 2 * ONE, WEEK);
        vm.prank(merchant);
        payLink.revokeAgent(agent);

        uint256 id = _create(agent, ONE);
        vm.startPrank(agent);
        token.approve(address(payLink), ONE);
        vm.expectRevert(PayLink.AgentNotApproved.selector);
        payLink.payInvoice(id);
        vm.stopPrank();
    }

    function test_P4_ExpiredApproval_CannotPay() public {
        _approve(agent, 2 * ONE, DAY);
        vm.warp(block.timestamp + DAY + 1);
        uint256 id = _create(agent, ONE);
        vm.startPrank(agent);
        token.approve(address(payLink), ONE);
        vm.expectRevert(PayLink.AgentApprovalExpired.selector);
        payLink.payInvoice(id);
        vm.stopPrank();
    }

    function test_P5_HumanWithoutApproval_PaysNormally() public {
        // No approval record for `payer`: v1 behavior, no cap, no AgentPaid.
        uint256 id = _create(payer, TEN);
        _pay(id, payer);
        assertEq(uint256(payLink.getInvoice(id).status), uint256(PayLink.Status.Paid));
        PayLink.AgentApproval memory ap = payLink.getAgentApproval(merchant, payer);
        assertEq(ap.cap, 0);
    }

    function test_P6_AgentAsDesignatedPayer_Works() public {
        _approve(agent, 5 * ONE, WEEK);
        uint256 id = _create(agent, ONE); // invoice addressed to the agent
        _pay(id, agent);
        assertEq(payLink.getInvoice(id).paidBy, agent);
    }

    // ---- fee ----

    function test_F1_FeeFor_Math() public view {
        assertEq(payLink.feeFor(TEN), 50_000); // 10 tUSD8 -> 0.05 fee
        assertEq(payLink.feeFor(ONE), 5_000); // 1 tUSD8 -> 0.005 fee
        assertEq(payLink.feeFor(199), 0); // dust: rounds down to 0
        assertEq(payLink.feeFor(200), 1);
        assertEq(payLink.feeFor(0), 0);
    }

    function test_F2_Settle_EmitsFeeCollected() public {
        uint256 id = _create(payer, TEN);
        _pay(id, payer);
        vm.expectEmit(true, true, false, true);
        emit PayLink.FeeCollected(id, feeCollector, 50_000);
        vm.prank(merchant);
        payLink.settleInvoice(id);
        assertEq(token.balanceOf(feeCollector), 50_000);
        assertEq(token.balanceOf(merchant), 1_000_000_000_000 + TEN - 50_000);
    }

    function test_F3_Refund_ReturnsFullAmount() public {
        uint256 id = _create(payer, TEN);
        _pay(id, payer);
        vm.warp(block.timestamp + 7 days + 1);
        uint256 before = token.balanceOf(payer);
        vm.prank(payer);
        payLink.refundInvoice(id);
        // Refund is fee-free: the FULL amount returns.
        assertEq(token.balanceOf(payer), before + TEN);
        assertEq(token.balanceOf(feeCollector), 0);
    }

    // ---- reputation ----

    function test_RP1_AgentSettle_GrowsReputation() public {
        vm.prank(agent);
        registry.registerAgent("InvoiceBot-01", "");
        _approve(agent, 5 * ONE, WEEK);
        uint256 id = _create(agent, ONE);
        _payAndSettle(id, agent);

        (uint256 count, uint256 volume) = registry.reputation(agent);
        assertEq(count, 1);
        assertEq(volume, ONE);

        uint256 id2 = _create(agent, ONE);
        _payAndSettle(id2, agent);
        (count, volume) = registry.reputation(agent);
        assertEq(count, 2);
        assertEq(volume, 2 * ONE);
    }

    function test_RP2_HumanSettle_NoReputationChange() public {
        vm.prank(agent);
        registry.registerAgent("InvoiceBot-01", "");
        uint256 id = _create(payer, TEN);
        _payAndSettle(id, payer);
        (uint256 count, uint256 volume) = registry.reputation(agent);
        assertEq(count, 0);
        assertEq(volume, 0);
    }

    function test_RP3_SettleStillWorks_WhenRegistryDeauthorized() public {
        vm.prank(agent);
        registry.registerAgent("InvoiceBot-01", "");
        _approve(agent, 5 * ONE, WEEK);
        // Registry owner deauthorizes this PayLink: settle must NOT revert.
        registry.authorizePayLink(address(payLink), false);
        uint256 id = _create(agent, ONE);
        _pay(id, agent);
        vm.prank(merchant);
        payLink.settleInvoice(id);
        assertEq(uint256(payLink.getInvoice(id).status), uint256(PayLink.Status.Settled));
        (uint256 count,) = registry.reputation(agent);
        assertEq(count, 0); // nothing recorded while deauthorized
    }

    function test_RP4_UnregisteredAgentPay_SettlesFine() public {
        // Agent pays but never registered: settle works, no reputation call.
        _approve(agent, 5 * ONE, WEEK);
        uint256 id = _create(agent, ONE);
        _payAndSettle(id, agent);
        assertEq(uint256(payLink.getInvoice(id).status), uint256(PayLink.Status.Settled));
    }
}
