// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

import { IBilling } from "./IBilling.sol";
import { ISubscriptions } from "./ISubscriptions.sol";

interface IRecurringPayments {
    struct BillingContract {
        uint256 id;
        address contractAddress;
        address tokenAddress;
        string name;
    }

    struct RecurringPayment {
        bytes32 taskId;
        uint256 amount;
        uint256 createdAt;
        uint256 lastExecutedAt;
        BillingContract billingContract;
    }

    function create(string calldata billingContractName, uint256 amount) external;

    function cancel() external;

    function execute(address user) external;

    function setExecutionInterval(uint128 _executionInterval) external;

    function setExpirationInterval(uint128 _expirationInterval) external;

    function registerBillingContract(string calldata name, address contractAddress, address tokenAddress) external;

    function unregisterBillingContract(string calldata name) external;

    function check(address user) external view returns (bool canExec, bytes memory execPayload);

    // NET time
    function getNextExecutionTime(address user) external view returns (uint256);

    // NET time
    function getExpirationTime(address user) external view returns (uint256);

    function getBillingContractId(string calldata name) external pure returns (uint256);
}
