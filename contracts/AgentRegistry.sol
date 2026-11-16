// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AgentRegistry — minimal on-chain agent identity + reputation for PayLink
/// @notice ERC-8004-shaped identity registry, built by us because QDay's
///         official agent registry / session-key / paymaster tooling has NO
///         published contract address, endpoint or SDK for Aevum testnet
///         (wiki.qday.info FAQ §5.3–5.4: "will be published in the docs").
///         This registry is self-contained on chain 44005 and will migrate
///         to QDay's official registry when it is published.
/// @dev An agent is identified by its wallet address. Anyone may register
///      their own address. Reputation (settled invoices + volume) is written
///      ONLY by PayLink contracts authorized by the registry owner — a
///      merchant settling an invoice paid by a registered agent grows that
///      agent's reputation. Nothing here is a claim of QDay integration.
contract AgentRegistry {
    struct Agent {
        address owner; // the wallet that registered this agent (== agent address)
        string name; // human-readable agent name
        string metadataURI; // off-chain metadata (description, capabilities, ...)
        uint256 registeredAt;
        uint256 settledCount; // invoices settled that this agent paid
        uint256 settledVolume; // total tUSD8 volume of those settled invoices
        bool exists;
    }

    /// @notice Deployer — may authorize / deauthorize PayLink contracts.
    address public immutable owner;

    mapping(address => Agent) private _agents;
    /// @notice PayLink contracts allowed to call recordSettlement.
    mapping(address => bool) public authorizedPayLinks;

    event AgentRegistered(
        address indexed agent, address indexed owner, string name, uint256 registeredAt
    );
    event SettlementRecorded(
        address indexed agent, uint256 amount, uint256 settledCount, uint256 settledVolume
    );
    event PayLinkAuthorized(address indexed payLink, bool authorized);

    error NotOwner();
    error NotAuthorizedPayLink();
    error AlreadyRegistered();
    error AgentNotRegistered();
    error EmptyName();
    error ZeroAddress();

    constructor() {
        owner = msg.sender;
    }

    /// @notice Register your own address as an agent. One registration per address.
    /// @param name Human-readable agent name (e.g. "InvoiceBot-01").
    /// @param metadataURI Off-chain metadata (IPFS/HTTPS link to capabilities, etc).
    function registerAgent(string calldata name, string calldata metadataURI) external {
        if (bytes(name).length == 0) revert EmptyName();
        if (_agents[msg.sender].exists) revert AlreadyRegistered();

        _agents[msg.sender] = Agent({
            owner: msg.sender,
            name: name,
            metadataURI: metadataURI,
            registeredAt: block.timestamp,
            settledCount: 0,
            settledVolume: 0,
            exists: true
        });

        emit AgentRegistered(msg.sender, msg.sender, name, block.timestamp);
    }

    /// @notice Called by an authorized PayLink contract when an invoice paid
    ///         by a registered agent settles. Grows the agent's reputation.
    function recordSettlement(address agent, uint256 amount) external {
        if (!authorizedPayLinks[msg.sender]) revert NotAuthorizedPayLink();
        if (!_agents[agent].exists) revert AgentNotRegistered();

        Agent storage a = _agents[agent];
        unchecked {
            a.settledCount += 1;
            a.settledVolume += amount;
        }

        emit SettlementRecorded(agent, amount, a.settledCount, a.settledVolume);
    }

    /// @notice Owner authorizes / deauthorizes a PayLink contract.
    function authorizePayLink(address payLink, bool authorized) external {
        if (msg.sender != owner) revert NotOwner();
        if (payLink == address(0)) revert ZeroAddress();
        authorizedPayLinks[payLink] = authorized;
        emit PayLinkAuthorized(payLink, authorized);
    }

    /// @notice True when the address has registered as an agent.
    function isRegistered(address agent) external view returns (bool) {
        return _agents[agent].exists;
    }

    /// @notice Full agent record (reverts for unregistered addresses).
    function getAgent(address agent) external view returns (Agent memory) {
        if (!_agents[agent].exists) revert AgentNotRegistered();
        return _agents[agent];
    }

    /// @notice Reputation: (settled invoice count, settled tUSD8 volume).
    function reputation(address agent)
        external
        view
        returns (uint256 settledCount, uint256 settledVolume)
    {
        Agent storage a = _agents[agent];
        if (!a.exists) revert AgentNotRegistered();
        return (a.settledCount, a.settledVolume);
    }
}
