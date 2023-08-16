// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

interface IRPBillingContract {
    function topUp(address recepient, uint256 amount) external;
}
