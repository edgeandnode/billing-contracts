// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IBilling } from "./IBilling.sol";
import "hardhat/console.sol";

/**
 * @title Banxa Wrapper
 * @dev Wraps the billing contract to provide a custom interface for the Banxa Fulfillment Service
 */
contract BanxaWrapper {
    // -- State --

    // The Graph Token contract
    IERC20 public immutable graphToken;

    // The billing contract
    IBilling public immutable billing;

    // -- Events --

    /**
     * @dev Order fullfilled by Banxa fulfilment service
     */
    event OrderFulfilled(address indexed to, uint256 amount);

    // -- Errors --

    /**
     * @dev Zero address not allowed.
     */
    error InvalidZeroAddress();

    /**
     * @dev Zero amount not allowed.
     */
    error InvalidZeroAmount();

    /**
     * @notice Constructor function for the contract
     * @param _token Graph Token address
     * @param _billing billing contract address
     */
    constructor(IERC20 _token, IBilling _billing) {
        if (address(_token) == address(0) || address(_billing) == address(0)) {
            revert InvalidZeroAddress();
        }

        graphToken = _token;
        billing = _billing;
    }

    /**
     * @notice Pulls tokens from sender and adds them into the billing contract for any user
     * Ensure graphToken.approve() is called on the wrapper contract first
     * @param _to  Address that tokens are being added to
     * @param _amount  Amount of tokens to add
     */
    function fulfil(address _to, uint256 _amount) external {
        if (_to == address(0)) {
            revert InvalidZeroAddress();
        }

        if (_amount == 0) {
            revert InvalidZeroAmount();
        }

        graphToken.transferFrom(msg.sender, address(this), _amount);
        graphToken.approve(address(billing), _amount);
        billing.addTo(_to, _amount);

        emit OrderFulfilled(_to, _amount);
    }
}
