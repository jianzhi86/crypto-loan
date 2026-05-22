// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Exercise: Collect ether, check balance, transfer all to owner
contract EtherCollector {

    address payable public owner;

    event Received(address indexed sender, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    constructor() {
        owner = payable(msg.sender);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // Anyone can send ETH to this contract
    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    // Check how much ETH is held in the contract
    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }

    // Owner withdraws all collected ETH
    function withdrawAll() public onlyOwner {
        uint256 amount = address(this).balance;
        require(amount > 0, "Nothing to withdraw");
        owner.transfer(amount);
        emit Withdrawn(owner, amount);
    }
}
