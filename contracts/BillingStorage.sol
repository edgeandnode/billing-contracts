// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import './IBilling.sol';

contract BillingStorage {
    // -- State --

    // Total amount of GRT we allow to be deposited, for safety, in case we can't get an audit
    // Set in constructor
    uint32 public depositThreshold;

    // Unpaid token maximum threshold where Gateway will stop serving queries to the users API key
    // Set in constructor
    // Maybe we could do without this. It doesn't do anything in the smart contract. It's just there for informational purposes
    // BUT - i think it might belong. otherwise we have to store this somewhere in a backend, or in the frontend.
    uint32 public unpaidTokenMax;

    // Matic GRT address
    // Set in constructor
    address public token;

    // Gateway address
    // Set in constructor
    address public gateway; 

    // user address --> User Struct
    mapping(address => User) public users;

}
