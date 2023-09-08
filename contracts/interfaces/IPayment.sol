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
     * @dev If the payment contract requires it, ensure IERC20.approve() is called
     * @param user Address of the user account
     * @param createData Encoded parameters required to create the payment on the target payment system.
     * @return amount The amount of tokens pulled by the payment contract
     */
    function create(address user, bytes calldata createData) external returns (uint256 amount);

    /**
     * @notice Tops up a user account with the specified `amount`.
     * @dev The amount is denominated in the payment contract's ERC20 token.
     * @dev Ensure IERC20.approve() is called on the payment contract first as funds are expected
     * to be drawn via `transferFrom`.
     * @param user Address of the user account
     * @param amount Amount to top up
     */
    function addTo(address user, uint256 amount) external;
}
