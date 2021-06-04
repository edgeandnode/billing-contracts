// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "../Governed.sol";

/**
 * @title GovernedMock contract
 */
contract GovernedMock is Governed {
    constructor() {
        Governed._initialize(msg.sender);
    }
}
