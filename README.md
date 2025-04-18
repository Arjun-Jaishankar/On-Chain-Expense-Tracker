# On-Chain Expense Tracker

![Project Screenshot](./screenshot.png)

A decentralized application for tracking and splitting expenses among college students, with all data stored on the Ethereum blockchain.

## Features

- User registration with Ethereum wallet
- Expense creation and tracking
- Debt calculation and visualization
- On-chain data storage (transparent and immutable)
- Responsive design

## Added Features

### Solidity Feature: Get Your Own Name
Added a function to retrieve the user's registered name directly:
```solidity
function getMyName() public view returns (string memory) {
    return people[msg.sender].name;
}
