// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./IBilling.sol";
import "./Governed.sol";

/**
 * @title Billing Contract
 * @dev The billing contract allows for Graph Tokens to be added by a user. The token can then
 * be pulled by a permissioned user named 'gateway'. It is owned and controlled by the 'governor'.
 */

contract Billing is IBilling, Governed {
    IERC20 private immutable graphToken;
    address public gateway;

    // user address --> user tokens
    mapping(address => uint256) public userBalances;

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
        _setGateway(_gateway);
        graphToken = _token;
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
        _setGateway(_newGateway);
    }

    /**
     * @dev Set the new gateway address
     * @param _newGateway  New gateway address
     */
    function _setGateway(address _newGateway) internal {
        require(_newGateway != address(0), "gateway != 0");
        gateway = _newGateway;
        emit GatewayUpdated(gateway);
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
        require(_user != address(0), "user != 0");
        require(graphToken.transferFrom(_from, address(this), _amount), "Add transfer failed");
        userBalances[_user] = userBalances[_user] + _amount;
        emit TokensAdded(_user, _amount);
    }

    /**
     * @dev Remove tokens from the billing contract
     * @param _user  Address that tokens are being removed from
     * @param _amount  Amount of tokens to remove
     */
    function remove(address _user, uint256 _amount) external override {
        require(userBalances[msg.sender] >= _amount, "Too much removed");
        userBalances[msg.sender] = userBalances[msg.sender] - _amount;
        require(graphToken.transfer(_user, _amount), "Remove transfer failed");
        emit TokensRemoved(msg.sender, _user, _amount);
    }

    /**
     * @dev Gateway pulls tokens from the billing contract
     * @param _user  Address that tokens are being pulled from
     * @param _amount  Amount of tokens to pull
     */
    function pull(address _user, uint256 _amount) external override onlyGateway {
        uint256 maxAmount = _pull(_user, _amount);
        if (maxAmount > 0) {
            require(graphToken.transfer(gateway, maxAmount), "Pull transfer failed");
        }
    }

    /**
     * @dev Gateway pulls tokens from many users in the billing contract
     * @param _users  Addresses that tokens are being pulled from
     * @param _amounts  Amounts of tokens to pull from each user
     */
    function pullMany(address[] calldata _users, uint256[] calldata _amounts) external override onlyGateway {
        require(_users.length == _amounts.length, "Lengths not equal");
        uint256 totalPulled;
        for (uint256 i = 0; i < _users.length; i++) {
            uint256 userMax = _pull(_users[i], _amounts[i]);
            totalPulled = totalPulled + userMax;
        }
        if (totalPulled > 0) {
            require(graphToken.transfer(gateway, totalPulled), "Pull Many transfer failed");
        }
    }

    /**
     * @dev Gateway pulls tokens from the billing contract. Uses Math.min() so that it won't fail
     * in the event that a user removes in front of the gateway pulling
     * @param _user  Address that tokens are being pulled from
     * @param _amount  Amount of tokens to pull
     */
    function _pull(address _user, uint256 _amount) internal returns (uint256) {
        uint256 maxAmount = Math.min(_amount, userBalances[_user]);
        if (maxAmount > 0) {
            userBalances[_user] = userBalances[_user] - _amount;
            emit TokensPulled(_user, _amount);
        }
        return maxAmount;
    }

    /**
     * @dev Allows the Gateway to rescue any ERC20 tokens sent to this contract by accident
     * @param _to  Destination address to send the tokens
     * @param _token  Token address of the token that was accidentally sent to the contract
     * @param _amount  Amount of tokens to pull
     */
    function rescueTokens(
        address _to,
        address _token,
        uint256 _amount
    ) external onlyGateway {
        require(_to != address(0), "Cannot send to address(0)");
        require(_amount != 0, "Cannot rescue 0 tokens");
        IERC20 token = IERC20(_token);
        require(token.transfer(_to, _amount), "Rescue tokens failed");
        emit TokensRescued(_to, _token, _amount);
    }
}
