// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IBilling } from "./IBilling.sol";
import { IBillingConnector } from "./IBillingConnector.sol";
import { Governed } from "./Governed.sol";
import { ITokenGateway } from "arb-bridge-peripherals/contracts/tokenbridge/libraries/gateway/ITokenGateway.sol";
import { Rescuable } from "./Rescuable.sol";
import { IERC20WithPermit } from "./IERC20WithPermit.sol";

/**
 * @title Billing Connector Contract
 * @dev The billing contract allows for Graph Tokens to be added by a user. The
 * tokens are immediately sent to the Billing contract on L2 (Arbitrum)
 * through the GRT token bridge.
 */
contract BillingConnector is IBillingConnector, Governed, Rescuable {
    // -- State --
    // The contract for interacting with The Graph Token
    IERC20 private immutable graphToken;
    // The L1 Token Gateway through which tokens are sent to L2
    ITokenGateway public l1TokenGateway;
    // The Billing contract in L2 to which we send tokens
    address public l2Billing;

    /**
     * @dev Address of the L1 token gateway was updated
     */
    event L1TokenGatewayUpdated(address l1TokenGateway);
    /**
     * @dev Address of the L2 Billing contract was updated
     */
    event L2BillingUpdated(address l2Billing);
    /**
     * @dev Tokens sent to the Billing contract on L2
     */
    event TokensSentToL2(address indexed _from, address indexed _to, uint256 _amount);

    /**
     * @dev Constructor function
     * @param _l1TokenGateway   L1GraphTokenGateway address
     * @param _l2Billing Address of the Billing contract on L2
     * @param _token     Graph Token address
     * @param _governor  Governor address
     */
    constructor(
        address _l1TokenGateway,
        address _l2Billing,
        IERC20 _token,
        address _governor
    ) Governed(_governor) {
        _setL1TokenGateway(_l1TokenGateway);
        _setL2Billing(_l2Billing);
        graphToken = _token;
    }

    /**
     * @dev Sets the L1 token gateway address
     * @param _l1TokenGateway New address for the L1 token gateway
     */
    function setL1TokenGateway(address _l1TokenGateway) external override onlyGovernor {
        _setL1TokenGateway(_l1TokenGateway);
    }

    /**
     * @dev Sets the L2 Billing address
     * @param _l2Billing New address for the L2 Billing contract
     */
    function setL2Billing(address _l2Billing) external override onlyGovernor {
        _setL2Billing(_l2Billing);
    }

    /**
     * @dev Add tokens into the billing contract on L2, for any user
     * Ensure graphToken.approve() is called for the BillingConnector contract first
     * @param _to  Address that tokens are being added to
     * @param _amount  Amount of tokens to add
     * @param _maxGas Max gas for the L2 retryable ticket execution
     * @param _gasPriceBid Gas price for the L2 retryable ticket execution
     * @param _maxSubmissionCost Max submission price for the L2 retryable ticket
     */
    function addToL2(
        address _to,
        uint256 _amount,
        uint256 _maxGas,
        uint256 _gasPriceBid,
        uint256 _maxSubmissionCost
    ) external payable override {
        require(_amount != 0, "Must add more than 0");
        require(_to != address(0), "destination != 0");
        _addToL2(msg.sender, _to, _amount, _maxGas, _gasPriceBid, _maxSubmissionCost);
    }

    /**
     * @dev Add tokens into the billing contract on L2, for any user, using a signed permit
     * @param _user Address of the current owner of the tokens, that will also be the destination in L2
     * @param _amount  Amount of tokens to add
     * @param _maxGas Max gas for the L2 retryable ticket execution
     * @param _gasPriceBid Gas price for the L2 retryable ticket execution
     * @param _maxSubmissionCost Max submission price for the L2 retryable ticket
     * @param _deadline Expiration time of the signed permit
     * @param _v Signature recovery id
     * @param _r Signature r value
     * @param _s Signature s value
     */
    function addToL2WithPermit(
        address _user,
        uint256 _amount,
        uint256 _maxGas,
        uint256 _gasPriceBid,
        uint256 _maxSubmissionCost,
        uint256 _deadline,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external payable override {
        require(_amount != 0, "Must add more than 0");
        require(_user != address(0), "destination != 0");
        IERC20WithPermit(address(graphToken)).permit(_user, address(this), _amount, _deadline, _v, _r, _s);
        _addToL2(_user, _user, _amount, _maxGas, _gasPriceBid, _maxSubmissionCost);
    }

    /**
     * @dev Allows the Governor to rescue any ERC20 tokens sent to this contract by accident
     * @param _to  Destination address to send the tokens
     * @param _token  Token address of the token that was accidentally sent to the contract
     * @param _amount  Amount of tokens to pull
     */
    function rescueTokens(
        address _to,
        address _token,
        uint256 _amount
    ) external override onlyGovernor {
        _rescueTokens(_to, _token, _amount);
    }

    /**
     * @dev Add tokens into the billing contract on L2, for any user
     * Ensure graphToken.approve() or graphToken.permit() is called for the BillingConnector contract first
     * @param _owner Address of the current owner of the tokens
     * @param _to  Address that tokens are being added to
     * @param _amount  Amount of tokens to add
     * @param _maxGas Max gas for the L2 retryable ticket execution
     * @param _gasPriceBid Gas price for the L2 retryable ticket execution
     * @param _maxSubmissionCost Max submission price for the L2 retryable ticket
     */
    function _addToL2(
        address _owner,
        address _to,
        uint256 _amount,
        uint256 _maxGas,
        uint256 _gasPriceBid,
        uint256 _maxSubmissionCost
    ) internal {
        require(graphToken.transferFrom(_owner, address(this), _amount), "Add transfer failed");

        bytes memory extraData = abi.encodeWithSelector(IBilling.addFromL1.selector, _to, _amount);

        bytes memory data = abi.encode(_maxSubmissionCost, extraData);

        graphToken.approve(address(l1TokenGateway), _amount);
        l1TokenGateway.outboundTransfer{ value: msg.value }(
            address(graphToken),
            l2Billing,
            _amount,
            _maxGas,
            _gasPriceBid,
            data
        );

        emit TokensSentToL2(_owner, _to, _amount);
    }

    /**
     * @dev Sets the L1 token gateway address
     * @param _l1TokenGateway New address for the L1 token gateway
     */
    function _setL1TokenGateway(address _l1TokenGateway) internal {
        require(_l1TokenGateway != address(0), "L1 Token Gateway cannot be 0");
        l1TokenGateway = ITokenGateway(_l1TokenGateway);
        emit L1TokenGatewayUpdated(_l1TokenGateway);
    }

    /**
     * @dev Sets the L2 Billing address
     * @param _l2Billing New address for the L2 Billing contract
     */
    function _setL2Billing(address _l2Billing) internal {
        require(_l2Billing != address(0), "L2 Billing cannot be zero");
        l2Billing = _l2Billing;
        emit L2BillingUpdated(_l2Billing);
    }
}
