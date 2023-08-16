// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

interface IPayment {
    function topUp(address recepient, uint256 amount) external;
}
