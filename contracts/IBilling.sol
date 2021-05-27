// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

interface IBilling {
    /**
     * @dev User deposits Graph Tokens
     */
    event Deposit(address indexed user, uint256 amount);
    /**
     * @dev User withdraws tokens. If (to == address(L1_bridge)), withdrawToL1()was called
     */
    event Withdraw(address indexed user, address indexed to, uint256 amount);

    /**
     * @dev Gateway pulled from a user deposit
     */
    event DepositPulled(address indexed user, uint256 amount);

    /**
     * @dev Gateway address updated
     */
    event GatewayUpdated(address indexed newGateway);

    /**
     * @dev Set the new gateway address
     * @param _newGateway  New gateway address
     */
    function setGateway(address _newGateway) external; // onlyGateway or onlyGovernor, or something

    /**
     * @dev Deposit tokens into the billing contract
     * @param _amount  Amount of tokens to deposit
     */
    function deposit(uint256 _amount) external;

    /**
     * @dev Deposit tokens into the billing contract for any user
     * @param _to  Address that tokens are being deposited to
     * @param _amount  Amount of tokens to deposit
     */
    function depositTo(address _to, uint256 _amount) external;

    /**
     * @dev Withdraw tokens from the billing contract
     * @param _to  Address that tokens are being withdrawn to
     * @param _amount  Amount of tokens to withdraw
     */
    function withdraw(address _to, uint256 _amount) external;

    // TODO - research if this is feasible. It should be
    // function withdrawToL1(uint256 _amount) external {}

    /**
     * @dev Gateway pulls tokens from the billing contract
     * @param _user  Address that tokens are being pulled from
     * @param _amount  Amount of tokens to pull
     */
    function pullDeposit(address _user, uint256 _amount) external; // onlyGateway modifier

    /**
     * @dev Gateway pulls tokens from many users in the billing contract
     * @param _users  Addresses that tokens are being pulled from
     * @param _amounts  Amounts of tokens to pull from each user
     */
    function pullDeposits(address[] calldata _users, uint256[] calldata _amounts) external;
}
