// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

interface IBilling {
    /**
     * @dev User deposits GRT to be pulled by the Gateway to pay an invoice
     */
    event Deposit(address indexed user, uint256 amount);
    /**
     * @dev User withdraws funds from the Billing contract
     *      If to == Matic L1 bridge, withdrawToL1() was called
     */
    event Withdraw(address indexed user, address indexed to, uint256 amount);

    /**
     * @dev Gateway successfully pulled from users deposits
     */
    event DepositPulled(address indexed user, uint256 amount);

    /**
     * @dev Gateway address updated
     */
     event GatewayUpdated(address indexed newGateway);

    // -- Configuration --

    /**
     * @dev Set the new gateway address
     * @param _newGateway  New gateway address
     */
    function setGateway(address _newGateway) external; // onlyGateway or onlyGovernor, or something

    // -- Functions --

    function deposit(uint256 _amount) external;

    // So anyone can deposit to a user
    function depositTo(address _to, uint256 _amount) external;

    function withdraw(address _to, uint256 _amount) external;

    // I believe it is possible since it can just go straight to the matic bridge and then get tunneled to ETH mainnet contract. Will verify
    // function withdrawToL1(uint256 _amount) external;

    function pullDeposit(address _user, uint256 _amount) external; // onlyGateway modifier

    // So the gateway can just do 1 tx and close out a lot of invoices. For loop on pullDeposit()
    // Gateway should pre-check the subgraph to not pull on users that would fail
    function pullDeposits(address[] calldata _users, uint256[] calldata _amounts) external;
}