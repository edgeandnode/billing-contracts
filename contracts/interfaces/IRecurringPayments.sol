// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IPayment } from "./IPayment.sol";

interface IRecurringPayments {
    struct PaymentType {
        uint256 id;
        IPayment contractAddress;
        IERC20 tokenAddress;
        string name;
    }

    struct RecurringPayment {
        bytes32 taskId;
        uint256 amount;
        uint256 createdAt;
        uint256 lastExecutedAt;
        PaymentType paymentType;
    }

    function create(string calldata paymentTypeName, uint256 amount) external;

    function cancel() external;

    function execute(address user) external;

    function setExecutionInterval(uint128 _executionInterval) external;

    function setExpirationInterval(uint128 _expirationInterval) external;

    function registerPaymentType(string calldata name, address contractAddress, address tokenAddress) external;

    function unregisterPaymentType(string calldata name) external;

    function check(address user) external view returns (bool canExec, bytes memory execPayload);

    // NET time
    function getNextExecutionTime(address user) external view returns (uint256);

    // NET time
    function getExpirationTime(address user) external view returns (uint256);

    function getPaymentTypeId(string calldata name) external pure returns (uint256);
}
