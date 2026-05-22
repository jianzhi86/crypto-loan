// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// If/Else example
contract Voting {

    uint public age;

    constructor(uint _age) {
        age = _age;
    }

    function canVote() public view returns (bool) {
        if (age >= 18) {
            return true;
        } else {
            return false;
        }
    }
}

// For loop example
contract SimpleForLoop {

    uint256[] private numbers = [1, 2, 3, 4, 5];

    function totalValue() public view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < numbers.length; i++) {
            total += numbers[i];
        }
        return total;
    }
}
