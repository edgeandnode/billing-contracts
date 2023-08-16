// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

import { IBilling } from "./IBilling.sol";
import { ISubscriptions } from "./ISubscriptions.sol";

interface IRecurringPayments {
    enum RecurringPaymentType {
        STREAM_GRT,
        STREAM_USDC
    }

    struct RecurringPayment {
        bytes32 taskId;
        uint256 amount;
        uint256 createdAt;
        uint256 lastExecutedAt;
        RecurringPaymentType paymentType;
        address billingContract;
        address billingToken;
    }

    function create(RecurringPaymentType type_, uint256 amount) external;

    function cancel() external;

    function execute(address user) external;

    function setBillingAddress(IBilling _billing) external;

    function setSubscriptionsAddress(ISubscriptions _subscriptions) external;

    function setExecutionInterval(uint128 _executionInterval) external;

    function setExpirationInterval(uint128 _expirationInterval) external;

    function check(address user) external view returns (bool canExec, bytes memory execPayload);

    // NET time
    function getNextExecutionTime(address user) external view returns (uint256);

    // NET time
    function getExpirationTime(address user) external view returns (uint256);
}
