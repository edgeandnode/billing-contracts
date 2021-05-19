// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

interface IBilling {

    struct User {
        uint256 tokensDeposited; // Total tokens deposited under users address
        uint256 tokensOwed;      // Increased when invoice is created. Decreases when paid. Subgraph will reveal the BAD scenario when owed > deposited
        mapping(uint256 => Invoice) invoices; // invoiceNumber --> invoiceAmount
    }

    struct Invoice {
        bool paid; // true if paid. TODO - thought, do we want to allow for partial payments?
        uint256 tokensOwed; // Filled in by gateway
    }

    /**
     * @dev User deposits GRT to be pulled by the Gateway to pay an invoice
     */
    event Deposit(uint256 amount, address user);
    /**
     * @dev User withdraws funds from the Billing contract
     *      If to == Matic L1 bridge, withdrawToL1() was called
     */
    event Withdraw(uint256 amount, address user, address to);
    /**
     * @dev Gateway created an invoice for a user to pay 
     */
    event InvoiceCreated(uint256 amount, address user, uint256 invoiceNumber);
    /**
     * @dev Gateway successfully pulled a deposit to pay for an invoice
     */
    event InvoicePaid(uint256 amount, address user, uint256 invoiceNumber);


    // -- Configuration --

    /**
     * @dev Set the maximum deposit of GRT each user can submit to the contract
     * @param _threshold  New threshold being set
     */
    function setDepositThreshold(uint256 _threshold) external;

    function setUnpaidTokenMax() external;

    // -- Functions --

    function deposit(uint256 amount) external;

    // So anyone can deposit to a user
    function depositTo(uint256 amount, address to) external;

    function withdraw(uint256 amount, address to) external;

    // I believe it is possible since it can just go straight to the matic bridge and then get tunneled to ETH mainnet contract. Will verify
    function withdrawToL1(uint256 amount) external;

    function pullDeposit(address user, uint256 invoiceNumber) external; // onlyGateway modifier

    // So the gateway can just do 1 tx and close out a lot of invoices. For loop on pullDeposit()
    // Gateway should pre-check the subgraph to not pull on users that would fail
    function pullDeposits(address[] calldata users, uint256[] calldata invoiceNumbers) external;

    // -- Getters -- 

    function getUserInvoice(address user, uint256 invoiceNumber) external view;



}