// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IBilling } from "./IBilling.sol";
import { Governed } from "./Governed.sol";
import { Rescuable } from "./Rescuable.sol";

/**
 * @title Billing Contract
 * @dev The billing contract allows for Graph Tokens to be added by a user. The token can then
 * be pulled by a permissioned set of users named 'collectors'. It is owned and controlled by the 'governor'.
 */
contract Billing is IBilling, Governed, Rescuable {
    // -- State --

    // The contract for interacting with The Graph Token
    IERC20 private immutable graphToken;
    // True for addresses that are Collectors
    mapping(address => bool) public isCollector;

    // maps user address --> user billing balance
    mapping(address => uint256) public userBalances;

    // The L2 token gateway address
    address public l2TokenGateway;

    // -- Events --

    /**
     * @dev User adds tokens
     */
    event TokensAdded(address indexed user, uint256 amount);
    /**
     * @dev User removes tokens
     */
    event TokensRemoved(address indexed user, address indexed to, uint256 amount);

    /**
     * @dev Gateway pulled tokens from a user
     */
    event TokensPulled(address indexed user, uint256 amount);

    /**
     * @dev Collector added or removed
     */
    event CollectorUpdated(address indexed collector, bool enabled);

    /**
     * @dev L2 Token Gateway address updated
     */
    event L2TokenGatewayUpdated(address l2TokenGateway);

    /**
     * @dev Constructor function
     * @param _collector   Initial collector address
     * @param _token     Graph Token address
     * @param _governor  Governor address
     */
    constructor(
        address _collector,
        IERC20 _token,
        address _governor,
        address _l2TokenGateway
    ) Governed(_governor) {
        _setCollector(_collector, true);
        _setL2TokenGateway(_l2TokenGateway);
        graphToken = _token;
    }

    /**
     * @dev Check if the caller is a Collector.
     */
    modifier onlyCollector() {
        require(isCollector[msg.sender], "Caller must be Collector");
        _;
    }

    /**
     * @dev Check if the caller is the L2 token gateway.
     */
    modifier onlyL2TokenGateway() {
        require(msg.sender == l2TokenGateway, "Caller must be L2 token gateway");
        _;
    }

    /**
     * @dev Set or unset an address as an allowed Collector
     * @param _collector  Collector address
     * @param _enabled True to set the _collector address as a Collector, false to remove it
     */
    function setCollector(address _collector, bool _enabled) external override onlyGovernor {
        _setCollector(_collector, _enabled);
    }

    /**
     * @dev Sets the L2 token gateway address
     * @param _l2TokenGateway New address for the L2 token gateway
     */
    function setL2TokenGateway(address _l2TokenGateway) external override onlyGovernor {
        _setL2TokenGateway(_l2TokenGateway);
    }

    /**
     * @dev Add tokens into the billing contract
     * Ensure graphToken.approve() is called on the billing contract first
     * @param _amount  Amount of tokens to add
     */
    function add(uint256 _amount) external override {
        _pullAndAdd(msg.sender, msg.sender, _amount);
    }

    /**
     * @dev Add tokens into the billing contract for any user
     * Ensure graphToken.approve() is called on the billing contract first
     * @param _to  Address that tokens are being added to
     * @param _amount  Amount of tokens to add
     */
    function addTo(address _to, uint256 _amount) external override {
        _pullAndAdd(msg.sender, _to, _amount);
    }

    /**
     * @dev Add tokens into the billing contract for any user, from L1
     * This can only be called from L2GraphTokenGateway.finalizeInboundTransfer.
     * @param _user  Address that tokens are being added to
     * @param _amount  Amount of tokens to add
     */
    function addFromL1(address _user, uint256 _amount) external override onlyL2TokenGateway {
        _add(_user, _amount);
    }

    /**
     * @dev Add tokens into the billing contract in bulk
     * Ensure graphToken.approve() is called on the billing contract first
     * @param _to  Array of addresses where to add tokens
     * @param _amount  Array of amount of tokens to add to each account
     */
    function addToMany(address[] calldata _to, uint256[] calldata _amount) external override {
        require(_to.length == _amount.length, "Lengths not equal");

        // Get total amount to add
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < _amount.length; i++) {
            require(_amount[i] > 0, "Must add more than 0");
            totalAmount += _amount[i];
        }
        require(graphToken.transferFrom(msg.sender, address(this), totalAmount), "Add transfer failed");

        // Add each amount
        for (uint256 i = 0; i < _to.length; i++) {
            address user = _to[i];
            require(user != address(0), "user != 0");
            userBalances[user] += _amount[i];
            emit TokensAdded(user, _amount[i]);
        }
    }

    /**
     * @dev Pull, then add tokens into the billing contract
     * Ensure graphToken.approve() is called on the billing contract first
     * @param _from  Address that is sending tokens
     * @param _user  User that is adding tokens
     * @param _amount  Amount of tokens to add
     */
    function _pullAndAdd(
        address _from,
        address _user,
        uint256 _amount
    ) private {
        require(_amount != 0, "Must add more than 0");
        require(_user != address(0), "user != 0");
        require(graphToken.transferFrom(_from, address(this), _amount), "Add transfer failed");
        _add(_user, _amount);
    }

    /**
     * @dev Add tokens into the billing account balance for a user
     * Tokens must already be in this contract's balance
     * @param _user  User that is adding tokens
     * @param _amount  Amount of tokens to add
     */
    function _add(address _user, uint256 _amount) private {
        userBalances[_user] = userBalances[_user] + _amount;
        emit TokensAdded(_user, _amount);
    }

    /**
     * @dev Remove tokens from the billing contract
     * @param _user  Address that tokens are being removed from
     * @param _amount  Amount of tokens to remove
     */
    function remove(address _user, uint256 _amount) external override {
        require(_amount != 0, "Must remove more than 0");
        require(userBalances[msg.sender] >= _amount, "Too much removed");
        userBalances[msg.sender] = userBalances[msg.sender] - _amount;
        require(graphToken.transfer(_user, _amount), "Remove transfer failed");
        emit TokensRemoved(msg.sender, _user, _amount);
    }

    /**
     * @dev Collector pulls tokens from the billing contract
     * @param _user  Address that tokens are being pulled from
     * @param _amount  Amount of tokens to pull
     * @param _to Destination to send pulled tokens
     */
    function pull(
        address _user,
        uint256 _amount,
        address _to
    ) external override onlyCollector {
        uint256 maxAmount = _pull(_user, _amount);
        _sendTokens(_to, maxAmount);
    }

    /**
     * @dev Collector pulls tokens from many users in the billing contract
     * @param _users  Addresses that tokens are being pulled from
     * @param _amounts  Amounts of tokens to pull from each user
     * @param _to Destination to send pulled tokens
     */
    function pullMany(
        address[] calldata _users,
        uint256[] calldata _amounts,
        address _to
    ) external override onlyCollector {
        require(_users.length == _amounts.length, "Lengths not equal");
        uint256 totalPulled;
        for (uint256 i = 0; i < _users.length; i++) {
            uint256 userMax = _pull(_users[i], _amounts[i]);
            totalPulled = totalPulled + userMax;
        }
        _sendTokens(_to, totalPulled);
    }

    /**
     * @dev Collector pulls tokens from the billing contract. Uses Math.min() so that it won't fail
     * in the event that a user removes in front of the Collector pulling
     * @param _user  Address that tokens are being pulled from
     * @param _amount  Amount of tokens to pull
     */
    function _pull(address _user, uint256 _amount) internal returns (uint256) {
        uint256 maxAmount = Math.min(_amount, userBalances[_user]);
        if (maxAmount > 0) {
            userBalances[_user] = userBalances[_user] - maxAmount;
            emit TokensPulled(_user, maxAmount);
        }
        return maxAmount;
    }

    /**
     * @dev Allows a Collector to rescue any ERC20 tokens sent to this contract by accident
     * @param _to  Destination address to send the tokens
     * @param _token  Token address of the token that was accidentally sent to the contract
     * @param _amount  Amount of tokens to pull
     */
    function rescueTokens(
        address _to,
        address _token,
        uint256 _amount
    ) external onlyCollector {
        _rescueTokens(_to, _token, _amount);
    }

    /**
     * @dev Send tokens to a destination account
     * @param _to Address where to send tokens
     * @param _amount Amount of tokens to send
     */
    function _sendTokens(address _to, uint256 _amount) internal {
        if (_amount > 0) {
            require(_to != address(0), "Cannot transfer to empty address");
            require(graphToken.transfer(_to, _amount), "Token transfer failed");
        }
    }

    /**
     * @dev Set or unset an address as an allowed Collector
     * @param _collector  Collector address
     * @param _enabled True to set the _collector address as a Collector, false to remove it
     */
    function _setCollector(address _collector, bool _enabled) internal {
        require(_collector != address(0), "Collector cannot be 0");
        isCollector[_collector] = _enabled;
        emit CollectorUpdated(_collector, _enabled);
    }

    /**
     * @dev Set the new L2 token gateway address
     * @param _l2TokenGateway  New L2 token gateway address
     */
    function _setL2TokenGateway(address _l2TokenGateway) internal {
        require(_l2TokenGateway != address(0), "L1 Token Gateway cannot be 0");
        l2TokenGateway = _l2TokenGateway;
        emit L2TokenGatewayUpdated(_l2TokenGateway);
    }
}
