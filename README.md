# billing-contracts
Billing project contracts for matic deployment

## Things the subgraph will do, so that they don't need to be in contracts
- Allows gateway to know when a `pullDeposit()` will fail, and skip over it
- Allows the gateway to know when the user owes more than `unpaidTokenMax`, and allow the gateway to stop serving queries
- Record periods (weekly, monthly, whatever we want). Record "due dates". And any other time based metric