// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.16;

import { IPayment } from "../interfaces/IPayment.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title Payment contract mock
 */
contract PaymentMock is IPayment {
    IERC20 public token;
    mapping(address user => uint256) public balances;

    constructor(address _token) {
        token = IERC20(_token);
    }

    function create(address user, uint256 amount) external override {
        balances[user] = amount;
        token.transferFrom(msg.sender, address(this), amount);
    }

    function addTo(address user, uint256 amount) external override {
        balances[user] += amount;
        token.transferFrom(msg.sender, address(this), amount);
    }
}

/**
 * @title Simple payment contract mock
 * @dev Does not implement the create function so not using the IPayment interface
 */
contract SimplePaymentMock {
    mapping(address user => uint256) public balances;

    function addTo(address user, uint256 amount) external {
        balances[user] += amount;
    }
}
