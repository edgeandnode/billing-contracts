// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.16;

/**
 * @title Mock for the Gelato Task treasury contract
 */
contract TaskTreasuryMock {
    /// @dev Noop. Receive eth and do nothing.
    function depositFunds(address receiver, address token, uint256 amount) external payable {}

    /// @dev Send eth to receiver.
    function withdrawFunds(address receiver, address token, uint256 amount) external {
        (bool sent, ) = payable(receiver).call{ value: amount }("");
        require(sent, "Failed to send Ether");
    }
}
