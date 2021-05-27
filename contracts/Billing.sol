// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IBilling.sol";
import "./Governed.sol";

/**
 * @title Billing
 * @dev The billing
 */

contract Billing is IBilling, Governed {
    IERC20 private immutable graphToken;
    address public gateway;

    // user address --> user deposited tokens
    mapping(address => uint256) public users;

    constructor(
        address _gateway,
        IERC20 _token,
        address _governor
    ) {
        Governed._initialize(_governor);
        gateway = _gateway;
        graphToken = _token;
        emit GatewayUpdated(_gateway);
    }

    modifier onlyGateway() {
        require(msg.sender == gateway, "!gateway");
        _;
    }

    /**
     * @dev Set the new gateway address
     * @param _newGateway  New gateway address
     */
    function setGateway(address _newGateway) external override onlyGovernor {
        gateway = _newGateway;
        emit GatewayUpdated(_newGateway);
    }

    function deposit(uint256 _amount) external override {
        _deposit(msg.sender, msg.sender, _amount);
    }

    // So anyone can deposit to a user
    function depositTo(address _to, uint256 _amount) external override {
        _deposit(msg.sender, _to, _amount);
    }

    function _deposit(
        address _from,
        address _user,
        uint256 _amount
    ) private {
        require(graphToken.transferFrom(_from, address(this), _amount));
        users[_user] = users[_user] + _amount;
        emit Deposit(_user, _amount);
    }

    function withdraw(address _to, uint256 _amount) external override {
        require(users[msg.sender] >= _amount, "Too much withdrawn");
        users[msg.sender] = users[msg.sender] - _amount;
        require(graphToken.transfer(_to, _amount), "Withdraw transfer failed");
        emit Withdraw(msg.sender, _to, _amount);
    }

    // // I believe it is possible since it can just go straight to the matic bridge and then get tunneled to ETH mainnet contract. TODO - verify
    // function withdrawToL1(uint256 _amount) external override  {
    //     require(users[msg.sender] >= _amount, "Too much withdrawn");
    //     users[msg.sender] = users[msg.sender].sub(_amount);
    //     // Would have to call directly to the tunnel address, possibly a raw transaction
    // }

    function pullDeposit(address _user, uint256 _amount) public override onlyGateway {
        require(users[_user] >= _amount, "Too much pulled");
        users[_user] = users[_user] - _amount;
        require(graphToken.transfer(gateway, _amount), "Pull transfer failed");
        emit DepositPulled(_user, _amount);
    }

    // So the gateway can just do 1 tx and close out a lot of invoices. For loop on pullDeposit()
    // Gateway should pre-check the subgraph to not pull on users that would fail
    function pullDeposits(address[] calldata _users, uint256[] calldata _amounts) external override {
        require(_users.length == _amounts.length, "Lengths not equal");
        for (uint256 i = 0; i < _users.length; i++) {
            pullDeposit(_users[i], _amounts[i]);
        }
    }
}
