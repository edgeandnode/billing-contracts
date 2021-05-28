// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IBilling.sol";
import "./Governed.sol";

/**
 * @title Billing Contract
 * @dev The billing contract allows for graph token to be added by a user, and for that token to
 * be pulled by a permissoned user named 'gateway'. It is owned and controlle by the 'governor'.
 */

contract Billing is IBilling, Governed {
    IERC20 private immutable graphToken;
    address public gateway;

    // user address --> user tokens
    mapping(address => uint256) public users;

    /**
     * @dev Constructor function
     * @param _gateway   Gateway address
     * @param _token     Graph Token address
     * @param _governor  Governor address
     */
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

    /**
     * @dev Check if the caller is the gateway.
     */
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

    /**
     * @dev Add tokens into the billing contract
     * @param _amount  Amount of tokens to add
     */
    function add(uint256 _amount) external override {
        _add(msg.sender, msg.sender, _amount);
    }

    /**
     * @dev Add tokens into the billing contract for any user
     * @param _to  Address that tokens are being added to
     * @param _amount  Amount of tokens to add
     */
    function addTo(address _to, uint256 _amount) external override {
        _add(msg.sender, _to, _amount);
    }

    /**
     * @dev Add tokens into the billing contract
     * @param _from  Address that is sending tokens
     * @param _user  User that is adding tokens
     * @param _amount  Amount of tokens to add
     */
    function _add(
        address _from,
        address _user,
        uint256 _amount
    ) private {
        require(graphToken.transferFrom(_from, address(this), _amount));
        users[_user] = users[_user] + _amount;
        emit Add(_user, _amount);
    }

    /**
     * @dev Remove tokens from the billing contract
     * @param _to  Address that tokens are being removed from
     * @param _amount  Amount of tokens to remove
     */
    function remove(address _to, uint256 _amount) external override {
        require(users[msg.sender] >= _amount, "Too much removed");
        users[msg.sender] = users[msg.sender] - _amount;
        require(graphToken.transfer(_to, _amount), "Remove transfer failed");
        emit Remove(msg.sender, _to, _amount);
    }

    // TODO - research if this is feasible. It should be
    // function removeToL1(uint256 _amount) external override  {}

    /**
     * @dev Gateway pulls tokens from the billing contract
     * @param _user  Address that tokens are being pulled from
     * @param _amount  Amount of tokens to pull
     */
    function pull(address _user, uint256 _amount) public override onlyGateway {
        require(users[_user] >= _amount, "Too much pulled");
        users[_user] = users[_user] - _amount;
        require(graphToken.transfer(gateway, _amount), "Pull transfer failed");
        emit Pulled(_user, _amount);
    }

    /**
     * @dev Gateway pulls tokens from many users in the billing contract
     * @param _users  Addresses that tokens are being pulled from
     * @param _amounts  Amounts of tokens to pull from each user
     */
    function pullMany(address[] calldata _users, uint256[] calldata _amounts) external override {
        require(_users.length == _amounts.length, "Lengths not equal");
        for (uint256 i = 0; i < _users.length; i++) {
            pull(_users[i], _amounts[i]);
        }
    }
}
