// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

/**
 * @title Payment interface
 * @notice This is a contract interface for a generic payments contract.
 * It is expected that the implementing contract will manage billing accounts for users;
 * how this is handled is left for the implementation to define. The only implicit requirement is
 * that each user must have a balance in an ERC20 token (defined by the contract) from which a
 * privileged role can draw funds from.
 */
interface IPayment {
    /**
     * @notice Creates a user account, using `amount` as the initial balance
     * @dev The amount is denominated in the payment contract's ERC20 token.
     * @param user Address of the user account
     * @param amount Amount to use as the initial balance
     */
    function createAccount(address user, uint256 amount) external;

    /**
     * @notice Tops up a user account with the specified `amount`.
     * @dev The amount is denominated in the payment contract's ERC20 token.
     * @dev The funds are expected to be drawn via `transferFrom` so proper allowances must be set.
     * @param user Address of the user account
     * @param amount Amount to top up
     */
    function topUpAccount(address user, uint256 amount) external;
}
