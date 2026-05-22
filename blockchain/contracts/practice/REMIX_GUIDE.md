# Using Practice Contracts in Remix IDE

## Compiler Setting
- Open https://remix.ethereum.org
- Click the **Solidity Compiler** tab (left sidebar)
- Set compiler version to **0.8.24**
- Enable "Auto compile" for convenience

---

## Contract-by-Contract Testing Guide

### 1. HelloWorld.sol
1. Paste code → Compile → Deploy
2. Click `message` → see "Hello World!"

---

### 2. DataType.sol
1. Deploy (no constructor args)
2. Click `viewData` → returns all 4 values
3. Click `toggleActive` → call `viewData` again, `isActive` flips
4. Click `incrementStudentId` → `studentId` increases by 100

---

### 3. ControlFlow.sol — two contracts in one file
**Voting:**
1. Deploy with constructor arg e.g. `17`
2. Call `canVote` → returns `false`
3. Redeploy with `20` → `canVote` returns `true`

**SimpleForLoop:**
1. Deploy (no args)
2. Call `totalValue` → returns `15` (1+2+3+4+5)

---

### 4. ArraysAndMappings.sol

**SimpleArray:**
1. Deploy → call `getColor(0)` → "red", `getColor(1)` → "green"
2. Try `getColor(5)` → reverts with "Index out of bounds"

**StudentNameMap:**
1. Deploy
2. Call `registerStudent("Ahmad")` (Account #0)
3. Call `getMyName` from same account → "Ahmad"
4. Switch to Account #1 → `getMyName` returns "" (empty — not registered)

---

### 5. EtherTransfer.sol

**ReceiveEther:**
1. Deploy
2. In the "Value" field type `1` and select `ether`
3. Click the red **(fallback)** or send ETH via low-level call
4. Click `getBalance` → see `1000000000000000000` (1 ETH in wei)

**SendEther:**
1. Deploy ReceiveEther first, copy its address
2. Deploy SendEther
3. Set Value = `0.5 ether`, call `sendViaCall(receiverAddress)`
4. Check ReceiveEther's `getBalance` → now 1.5 ETH

---

### 6. EtherCollector.sol ← YOUR EXERCISE ANSWER

1. Deploy from Account #0 (this becomes `owner`)
2. Switch to Account #1, set Value = `1 ether`, click **(fallback)**
   - ETH is now inside the contract
3. Click `getBalance` → `1000000000000000000`
4. Switch back to Account #0 (owner)
5. Click `withdrawAll` → ETH sent to owner's wallet
6. Click `getBalance` → `0`
7. **Try from Account #1:** click `withdrawAll` → REVERTS "Not owner" ✓

---

### 7. FunctionTypes.sol
1. Deploy
2. `addOne(5)` → `6` (no gas cost for call, pure function)
3. `doubleStoredValue` → `20`
4. `setNum(7)` → changes state (MetaMask popup in injected provider)
5. `doubleStoredValue` → `14`

---

### 8. Struct.sol
1. Deploy
2. Click `john` → `("John Doe", 30, 0xYourAddress)`
3. `updateStudentAge(25)` → click `john` again → age is now 25

---

### 9. Gradebook.sol ← EXERCISE

**Deploy:** constructor needs a professor address.
Use the current account address from the Remix "Account" dropdown.

1. Deploy with your Account #0 address
2. Call `addStudent(Account#1_addr, "Siti")` from Account #0
3. Call `assignGrade(Account#1_addr, 85)` from Account #0
4. Call `getStudentInfo(Account#1_addr)` → `("Siti", 85)`
5. **Try from Account #1:** `addStudent(...)` → REVERTS "Unauthorized access" ✓

---

### 10. ArtMarket.sol ← EXERCISE

1. Deploy from Account #0
2. `createArtwork("Sunset", "QmXyz123", 500000000000000000)` (0.5 ETH in wei)
   - `nextArtId` becomes 1
3. `getArtwork(0)` → shows title, artist, price, owner = Account #0
4. Switch to Account #1, set Value = `0.5 ether`
5. `buyArtwork(0)` → Account #0 receives the ETH, Account #1 becomes owner
6. `getArtwork(0)` → `currentOwner` is now Account #1 ✓
7. **Try buying again from Account #1:** REVERTS "You already own this artwork" ✓

---

## Quick Wei / ETH Converter
| ETH | Wei |
|-----|-----|
| 0.001 | 1000000000000000 |
| 0.1  | 100000000000000000 |
| 0.5  | 500000000000000000 |
| 1.0  | 1000000000000000000 |

Use Remix's **Value** field with the dropdown to avoid manual conversion.

---

## Using in This Hardhat Project

All contracts are in `blockchain/contracts/practice/`.
They compile automatically with:
```bash
cd blockchain
npx hardhat compile
```
Artifacts appear in `blockchain/artifacts/contracts/practice/`.
