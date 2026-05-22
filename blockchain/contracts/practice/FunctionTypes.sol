// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// pure  = no state read, no state write — lowest gas
// view  = reads state, no write — lower gas
// (default) = reads + writes state — normal gas

contract FunctionType {

    uint256 public num = 10;

    // pure: does NOT read num, works only on its argument
    function addOne(uint256 a) public pure returns (uint256) {
        return a + 1;
    }

    // view: reads num from storage but does not change it
    function doubleStoredValue() public view returns (uint256) {
        return num * 2;
    }

    // normal: writes to state, costs gas when called externally
    function setNum(uint256 _num) public {
        num = _num;
    }
}
