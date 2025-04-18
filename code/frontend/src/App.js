import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import './App.css';
import ExpenseTrackerABI from './ExpenseTrackerABI.json';

function App() {
  // State variables
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [name, setName] = useState('');
  const [myName, setMyName] = useState('');
  const [expenses, setExpenses] = useState([]);
  const [people, setPeople] = useState([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [expenseLabel, setExpenseLabel] = useState('');
  const [participants, setParticipants] = useState([{ address: '', amountPaid: 0, amountOwed: 0 }]);
  const [showAddExpense, setShowAddExpense] = useState(false);
  
  // Update this with your contract address
  const contractAddress = "0x6216a5ead85447a832d42eb707780304d1f95f0c";

  // Load expenses function
  const loadExpenses = useCallback(async () => {
    if (!contract || !isRegistered) return;
    setLoadingExpenses(true);
    try {
      const count = await contract.expenseCount();
      const loaded = [];
  
      for (let i = 0; i < count; i++) {
        try {
          const [id, label, timestamp] = await contract.getExpenseBasicInfo(i);
          const participantsAddresses = await contract.getExpenseParticipants(i);
  
          const participantsData = await Promise.all(
            participantsAddresses.map(async (address) => {
              try {
                const amountPaid = await contract.getAmountPaid(i, address);
                const amountOwed = await contract.getAmountOwed(i, address);
                return {
                  address,
                  amountPaid: ethers.utils.formatEther(amountPaid),
                  amountOwed: ethers.utils.formatEther(amountOwed),
                };
              } catch (error) {
                console.error(`Error loading amounts for participant ${address}:`, error);
                return { address, amountPaid: "0", amountOwed: "0" };
              }
            })
          );
  
          loaded.push({
            id: id.toNumber(),
            label,
            timestamp: new Date(timestamp.toNumber() * 1000).toLocaleString(),
            participants: participantsData,
          });
        } catch (error) {
          console.error(`Error loading expense ${i}:`, error);
        }
      }
  
      setExpenses(loaded);
    } catch (error) {
      console.error("Error loading expenses:", error);
      alert("Could not load expenses. Check console.");
    } finally {
      setLoadingExpenses(false);
    }
  }, [contract, isRegistered]);

  // Load people function
  const loadPeople = useCallback(async () => {
    if (!contract) return;
    try {
      const addresses = await contract.getAllRegisteredPeople();
      const peopleData = await Promise.all(
        addresses.map(async (address) => {
          const person = await contract.getPerson(address);
          const netBalance = await contract.getNetBalance(address);
          return {
            address,
            name: person.name,
            netBalance: ethers.utils.formatEther(netBalance),
          };
        })
      );
      setPeople(peopleData);
    } catch (error) {
      console.error("Error loading people:", error);
    }
  }, [contract]);

  // Load user's name using the new getMyName function
  const loadMyName = useCallback(async () => {
    if (contract && account) {
      try {
        const name = await contract.getMyName();
        setMyName(name);
      } catch (error) {
        console.error("Error loading name:", error);
      }
    }
  }, [contract, account]);

  // Connect wallet function
  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        alert("Please install MetaMask!");
        return;
      }
      
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      const provider = new ethers.providers.Web3Provider(window.ethereum);

      const network = await provider.getNetwork();
      if (network.chainId !== 11155111) {
        alert("Please connect to Sepolia testnet.");
        return;
      }

      const signer = provider.getSigner();
      const address = await signer.getAddress();
      
      setAccount(address);
      setIsConnected(true);

      const contractInstance = new ethers.Contract(contractAddress, ExpenseTrackerABI, signer);
      setContract(contractInstance);

      window.ethereum.on('accountsChanged', (accounts) => {
        setAccount(accounts[0] || '');
        setIsConnected(accounts.length > 0);
      });
    } catch (error) {
      console.error("Connection error:", error);
      alert("Failed to connect wallet. See console for details.");
    }
  };

  // Register person function
  const registerPerson = async () => {
    if (!name.trim()) {
      alert("Please enter your name.");
      return;
    }
    try {
      const tx = await contract.registerPerson(name.trim());
      await tx.wait();
      setIsRegistered(true);
      alert("Registration successful!");
      await loadPeople();
      await loadExpenses();
      await loadMyName();
    } catch (error) {
      console.error("Registration failed:", error);
      alert(`Registration failed: ${error.message}`);
    }
  };

  // Add expense function
  const addExpense = async () => {
    if (!expenseLabel.trim()) {
      alert("Enter an expense label.");
      return;
    }
    if (participants.length === 0) {
      alert("Add at least one participant.");
      return;
    }

    for (const participant of participants) {
      if (!participant.address || participant.amountPaid < 0 || participant.amountOwed < 0) {
        alert("Participant details are invalid.");
        return;
      }
    }

    try {
      const addresses = participants.map(p => p.address.trim());
      const paidAmounts = participants.map(p => ethers.utils.parseEther(p.amountPaid.toString()));
      const owedAmounts = participants.map(p => ethers.utils.parseEther(p.amountOwed.toString()));

      const tx = await contract.addExpense(expenseLabel, addresses, paidAmounts, owedAmounts);
      await tx.wait();

      setExpenseLabel('');
      setParticipants([{ address: '', amountPaid: 0, amountOwed: 0 }]);
      setShowAddExpense(false);
      await loadExpenses();
      await loadPeople();
    } catch (error) {
      console.error("Error adding expense:", error);
      alert(`Error: ${error.message}`);
    }
  };

  // Participant management functions
  const addParticipant = () => {
    setParticipants([...participants, { address: '', amountPaid: 0, amountOwed: 0 }]);
  };

  const updateParticipant = (index, field, value) => {
    const updated = [...participants];
    updated[index][field] = value;
    setParticipants(updated);
  };

  const removeParticipant = (index) => {
    if (participants.length > 1) {
      setParticipants(participants.filter((_, i) => i !== index));
    }
  };

  // Initialization effect
  useEffect(() => {
    const init = async () => {
      if (window.ethereum) {
        try {
          await connectWallet();
        } catch (error) {
          console.error("Initialization error:", error);
        }
      } else {
        alert("Please install MetaMask.");
      }
    };

    init();

    return () => {
      if (window.ethereum) {
        window.ethereum.removeAllListeners('accountsChanged');
      }
    };
  }, []);

  // Effect to check registration status
  useEffect(() => {
    const checkRegistration = async () => {
      if (!contract || !account) return;

      try {
        const person = await contract.getPerson(account);
        const registered = person.walletAddress !== ethers.constants.AddressZero;
        setIsRegistered(registered);
        
        if (registered) {
          setName(person.name);
          await loadExpenses();
          await loadPeople();
          await loadMyName();
        }
      } catch (error) {
        console.error("Error checking registration:", error);
      }
    };
    checkRegistration();
  }, [contract, account, loadExpenses, loadPeople, loadMyName]);

  // Debugging effect
  useEffect(() => {
    if (expenses.length > 0) {
      console.log("LOADED EXPENSES:", expenses);
      console.log("LOADED PEOPLE:", people);
    }
  }, [expenses, people]);

  return (
    <div className="App">
      <header className="App-header">
        <h1>On-Chain Expense Tracker</h1>
        
        {!isConnected ? (
          <div className="connection-panel">
            <button onClick={connectWallet} className="connect-button">
              Connect Wallet
            </button>
            <p className="instruction-text">Please connect your MetaMask wallet to continue</p>
          </div>
        ) : !isRegistered ? (
          <div className="registration-panel">
            <h2>Register</h2>
            <input
              type="text"
              placeholder="Your Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="name-input"
            />
            <button onClick={registerPerson} className="register-button">
              Register
            </button>
          </div>
        ) : (
          <div className="main-app">
            <div className="user-info">
              <h2>Welcome, {myName || name}</h2>
              <p className="account-address">Account: {account}</p>
            </div>

            <div className="action-buttons">
              <button 
                onClick={() => setShowAddExpense(!showAddExpense)} 
                className={showAddExpense ? "cancel-button" : "add-expense-button"}
              >
                {showAddExpense ? "Cancel" : "Add Expense"}
              </button>
              <button onClick={loadExpenses} className="refresh-button">
                Refresh Expenses
              </button>
            </div>

            {showAddExpense && (
              <div className="expense-form">
                <h3>New Expense</h3>
                <input
                  type="text"
                  placeholder="Expense Label"
                  value={expenseLabel}
                  onChange={(e) => setExpenseLabel(e.target.value)}
                  className="expense-label-input"
                />
                
                <div className="participants-list">
                  {participants.map((p, idx) => (
                    <div key={idx} className="participant-row">
                      <input
                        placeholder="Participant Address"
                        value={p.address}
                        onChange={(e) => updateParticipant(idx, 'address', e.target.value)}
                        className="address-input"
                      />
                      <input
                        type="number"
                        placeholder="Amount Paid"
                        value={p.amountPaid}
                        onChange={(e) => updateParticipant(idx, 'amountPaid', e.target.value)}
                        min="0"
                        step="0.01"
                        className="amount-input"
                      />
                      <input
                        type="number"
                        placeholder="Amount Owed"
                        value={p.amountOwed}
                        onChange={(e) => updateParticipant(idx, 'amountOwed', e.target.value)}
                        min="0"
                        step="0.01"
                        className="amount-input"
                      />
                      {participants.length > 1 && (
                        <button 
                          onClick={() => removeParticipant(idx)} 
                          className="remove-participant-button"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="form-actions">
                  <button onClick={addParticipant} className="add-participant-button">
                    Add Participant
                  </button>
                  <button onClick={addExpense} className="save-expense-button">
                    Save Expense
                  </button>
                </div>
              </div>
            )}

            <div className="people-section">
              <h3>Registered Users</h3>
              <div className="people-table-container">
                <table className="people-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Address</th>
                      <th>Net Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((person, idx) => (
                      <tr key={idx}>
                        <td>{person.name}</td>
                        <td className="address-cell">{person.address.substring(0, 8)}...</td>
                        <td className={parseFloat(person.netBalance) < 0 ? "negative-balance" : "positive-balance"}>
                          {parseFloat(person.netBalance).toFixed(5)} ETH
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="expense-history">
              <h3>Expense History</h3>
              {loadingExpenses ? (
                <div className="loading-spinner">
                  <p>Loading...</p>
                </div>
              ) : expenses.length === 0 ? (
                <p className="no-expenses">No expenses recorded yet</p>
              ) : (
                <div className="expense-list">
                  {expenses.map(expense => (
                    <div key={expense.id} className="expense-card">
                      <div className="expense-header">
                        <h4>{expense.label}</h4>
                        <p className="expense-date">{expense.timestamp}</p>
                      </div>
                      
                      <table className="expense-details">
                        <thead>
                          <tr>
                            <th>Participant</th>
                            <th>Paid</th>
                            <th>Owes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {expense.participants.map((p, idx) => (
                            <tr key={idx}>
                              <td>
                                {people.find(person => person.address === p.address)?.name || p.address.substring(0, 8)}...
                              </td>
                              <td>{p.amountPaid} ETH</td>
                              <td>{p.amountOwed} ETH</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </header>
    </div>
  );
}

export default App;
