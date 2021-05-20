// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import './IBilling.sol';

contract BillingStorage {
    // Matic GRT address
    // Set in constructor
    address public immutable token;

    // Gateway address
    // Set in constructor
    address public gateway; 

    // user address --> User Struct
    mapping(address => User) public users;
}
