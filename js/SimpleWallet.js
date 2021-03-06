/*
 * SimpleWallet.js
 *
 * This is the <modified> core of the LiteVault, all of this Typescript
 * and/or related javascript is held under the AGPL Licence
 * unless otherwise noted on the Git repository
 *
 * Created by Someguy123 (http://someguy123.com)
 * Modified by bitspill
 */
var flovaultBaseURL = "https://flovault.alexandria.io";
var florinsightBaseURL = "https://florinsight.alexandria.io";

var Wallet = (function () {
	function Wallet(identifier, password) {
		this.addresses = {};
		this.balances = {};
		this.coin_network = Bitcoin.networks.florincoin;
		this.CryptoConfig = {
			mode: CryptoJS.mode.CBC,
			padding: CryptoJS.pad.Iso10126,
			iterations: 5
		};
		this.identifier = identifier;
		this.password = password;
		this.known_spent = [];
		this.known_unspent = [];
		var spentkey = 'spentdata-'+identifier;
		if(spentkey in localStorage) {
			try {
				var spdata = JSON.parse(localStorage[spentkey]);
				this.known_spent = spdata.spent;
				this.known_unspent = spdata.unspent;
			} catch(e) {
				// local data is corrupt?
				delete localStorage[spentkey];
			}
		}
	};

	Wallet.prototype.putSpent = function (spent) {
		this.known_spent.push(spent);
		var unspent = this.known_unspent;
		// clean out known unspent
		for (var v in unspent) {
			if (JSON.stringify(spent) == JSON.stringify(unspent[v])) {
				delete this.known_unspent[v];
			}
		}
		this.storeSpent();
	};

	Wallet.prototype.putUnspent = function (spent) {
		this.known_unspent.push(spent);
		// if it is in the spent, remove it from there.
		// clean out known unspent
		for (var v in this.known_spent) {
			if (this.known_spent[v] && spent && spent.txid === this.known_spent[v].txid && this.known_spent[v].confirmations <= 0) {
				delete this.known_spent[v];
			}
		}
		this.storeSpent();
	};

	Wallet.prototype.storeSpent = function() {
		// first clean the arrays
		this.known_spent = this.known_spent.filter(function(x) { return x !== null && x !== undefined });
		this.known_unspent = this.known_unspent.filter(function(x) { return x !== null && x !== undefined });
		// now actually store it
		var spdata = {spent: this.known_spent, unspent: this.known_unspent};

		var spentkey = 'spentdata-'+this.identifier;
		localStorage[spentkey] = JSON.stringify(spdata);
	}
	/**
	 * setSharedKey()
	 *
	 * This is used when the wallet is first created, we get the shared key
	 * from the server, we give it to this wallet object using this function
	 * because we haven't yet written the encrypted wallet to the server
	 * which contains the shared key.
	 *
	 * @param sKey
	 */
	Wallet.prototype.setSharedKey = function (sKey) {
		this.shared_key = sKey;
	};

	Wallet.prototype.generateAddress = function () {
		var key = Bitcoin.ECKey.makeRandom();
		var PubKey = key.pub.getAddress(this.coin_network).toString();
		var PrivKey = key.toWIF(this.coin_network);
		this.addAddress(PubKey, {label: "", priv: PrivKey, addr: PubKey});
		this.refreshBalances();
		this.store();
	};
	Wallet.prototype.addAddress = function (address, data) {
		if (address in this.addresses) {
			var event = new CustomEvent('wallet', {'detail': "Address " + address + " already exists, skipping."});
			
			window.dispatchEvent(event);
			//swal("Warning", "Warning: address " + address + " already exists, skipping.", "warning");
		}
		else {
			this.addresses[address] = data;
		}
	};

	Wallet.prototype.load = function (_success) {
		if (_success === void 0) {
			_success = function () {
			};
		}
		var _this = this;
		$.ajax({
			url : flovaultBaseURL + "/wallet/load/" + this.identifier,
			type: "GET",
			dataType: "json",
			// xhrFields: {
			// 	withCredentials: true
			// },
			error: function (error) {
				console.log(error);
				//swal("Error", "Error loading wallet from server. Possible connection problems. Try again later.", "error");
				var event = new CustomEvent('wallet', {'detail': 'server-no-response'});
				
				window.dispatchEvent(event);
			},
			success: function (data) {
				if (data.error !== false) {
					//swal("Error!", data.error.message, "error");
					var event = new CustomEvent('wallet', {'detail': data.error.message});
				
					window.dispatchEvent(event);
				}
				else {
					var decWallet, decWalletString, decWalletJSON;
					//console.log("Decrypting data: '" + data.wallet + "' with password " + _this.password);
					// console.log('Decrypting wallet');
					try {
						// Decrypt wallet
						decWallet = CryptoJS.AES.decrypt(data.wallet, _this.password, _this.CryptoConfig);
						decWalletString = decWallet.toString(CryptoJS.enc.Utf8);
						// Load the JSON, then use it to initialize the wallet
						decWalletJSON = JSON.parse(decWalletString);
						_this.setSharedKey(decWalletJSON.shared_key);
						_this.addresses = decWalletJSON.addresses;
						// console.log('Wallet loaded successfully. Refreshing balances and running success callback.');
						try {
							_this.refreshBalances();
							// run the success callback
							_success();
						}
						catch (ex) {
							//swal("Error", "There was an error rendering this page. Please contact an administrator.", "error");
							var event = new CustomEvent('wallet', {'detail': 'render-error'});
						
							window.dispatchEvent(event);
							// console.log(ex);
						}
					}
					catch (ex) {
						var event = new CustomEvent('wallet', {'detail': 'invalid-password'});
						
						window.dispatchEvent(event);
						//swal("Error", "Error decrypting wallet - Invalid password?", "error");
						// console.log(ex);
					}
				}
			}
		});
	};
	Wallet.prototype.store = function () {
		var walletData = this.wallet_serialize();
		// console.log("Encrypting data");
		var encWalletData = CryptoJS.AES.encrypt(walletData, this.password, this.CryptoConfig);
		var encWalletDataCipher = encWalletData.toString();
		var _this = this;
		$.post(flovaultBaseURL + "/wallet/update", {
			identifier: this.identifier,
			shared_key: this.shared_key,
			wallet_data: encWalletDataCipher
		}, function (data) {
			if (data.error !== false) {
				//swal("Error", data.error.message, "error");
				//swal("Error", 'WARNING: There was an error saving your wallet. ' +
				//	'If you have created new addresses in the past few minutes, ' +
				//	'please save their private keys ASAP, as your encrypted wallet' +
				//	' may not have been updated properly on our servers.', "error");
				var event = new CustomEvent('wallet', {'detail': 'store-error'});
					
				window.dispatchEvent(event);
			}
		}, "json").fail(function () {
			//swal("Error", 'WARNING: There was an error saving your wallet. ' +
			//	'If you have created new addresses in the past few minutes, ' +
			//	'please save their private keys ASAP, as your encrypted wallet' +
			//	' may not have been updated properly on our servers.', error);
			var event = new CustomEvent('wallet', {'detail': 'store-post-error'});
					
			window.dispatchEvent(event);
		});
	};

	/**
	 * refreshBalances(callback)
	 *
	 * Updates balances from server, then outputs the balance map
	 * to the callback function.
	 *
	 * @param callback(balances)
	 */
	Wallet.prototype.refreshBalances = function (callback) {
		if (callback === void 0) {
			callback = function (balances) {
			};
		}
		this.totBal = 0;
		var _this = this;
		this.updateBal = function(balance){
			try {
				if (balance < 10000) {
					//$('#walletBalance').text(balance.toFixed(5));
				} else {
					//$('#walletBalance').text(balance.toFixed(3));
				}
			} catch (e) { 
				// Oh well, give up setting balance.
			}
		}
		for (var i in this.addresses) {
			$.ajax(flovaultBaseURL + '/wallet/getbalances/' + this.addresses[i].addr, {
				async: false,
				dataType: "json",
				success: function (data) {
					if (data) {
						var addr_data = data;

						var unspentBal = 0;

						if (_this.known_unspent){
							_this.putSpent.bind(_this);
							for (var j = 0; j < _this.known_unspent.length; j++) {
								if (_this.known_unspent[j].address === addr_data['addrStr']){
									var match = false;

									if (addr_data['transactions']){
										for (var k = 0; k < addr_data['transactions'].length; k++) {
											if (_this.known_unspent[j] && addr_data['transactions'][k] === _this.known_unspent[j].txid){
												_this.putSpent(_this.known_unspent[j]);
												matchObj = _this.known_unspent[j];
												match = true;
											}
										}
									}

									if (_this.known_spent){
										for (var k = 0; k < _this.known_spent.length; k++) {
											if (_this.known_unspent[j] && _this.known_spent[k].txid === _this.known_unspent[j].txid){  
												matchObj = _this.known_unspent[j];
												match = true;
											}
										}
									}

									if (!match){
										unspentBal += _this.known_unspent[j].amount;
									}
								}
							}
						}
						
						var showBalance = 0;

						if (parseFloat(addr_data['balance']) > unspentBal && unspentBal != 0){
							showBalance = unspentBal;
						} else {
							showBalance = parseFloat(addr_data['balance']);
						}


						_this.setBalance(addr_data['addrStr'], parseFloat(showBalance));
						_this.totBal += addr_data['balance'];
						_this.updateBal(_this.totBal);
						callback(data);
					}
				}
			});
		}
		this.totBal = 0;
	};
	Wallet.prototype.getUnspent = function (address, callback) {
		var _this = this;
		$.get(florinsightBaseURL + '/api/addr/' + address + '/utxo', function (data) {
			// console.log(data);
			// put into window var
			var output;
			// blockr's API is inconsistent and returns a bare object
			// if there's only one unspent. We fix that and return an array ALWAYS.
			if (Array.isArray(data)) {
				output = data;
			}
			else {
				output = [data];
			}

			for (var i = 0; i < output.length; i++) {
				_this.putUnspent.bind(_this);

				_this.putUnspent(output[i]);
			}

			callback(output);
		}, "json");
	};

	/**
	 * Attempts to remove inputs that are known to be spent.
	 * This helps avoid problems when sending multiple transactions shortly
	 * after eachother.
	 */
	Wallet.prototype.removeSpent = function (coins) {
		// console.log("removeSpent");
		// console.log(JSON.stringify(coins));
		var clean_coins = coins;
		for (var v in this.known_spent) {
			for (var k in coins) {
				if (JSON.stringify(coins[k]) == JSON.stringify(this.known_spent[v])) {
					delete clean_coins[k];
				}
			}
		}
		// console.log(JSON.stringify(clean_coins));
		return clean_coins;
	};
	Wallet.prototype.mergeUnspent = function (unspent, address) {
		var merged = unspent;
		// console.log("!unspent!");
		// console.log(JSON.stringify(unspent, null, 2));

		for (var i = 0; i < this.known_unspent.length; ++i) {
			// note: we delete from known_unspent on spend, so we need to check if it's undefined
			if (this.known_unspent[i] !== undefined && this.known_spent[i] !== null && this.known_unspent[i].address == address) 
			{
				var dupe = false;
				for (var j = 0; j < unspent.length; ++j)
					if (this.known_unspent[i].txid == merged[j].txid && this.known_unspent[i].vout == merged[j].vout) {
						dupe = true;
						break;
					}
				if (!dupe)
					merged.push(this.known_unspent[i]);
			}
		}
		// console.log("!known_unspent!");
		// console.log(JSON.stringify(this.known_unspent, null, 2));
		// console.log("!merged!");
		// console.log(JSON.stringify(merged, null, 2));
		return merged;
	};
	/**
	 * calculateBestUnspent()
	 *
	 * Sorts passed in unspents by confirmations descending.
	 *
	 * Returns an object containing the required unspents to match the
	 * amount requested, as well as the total Litecoin value of them.
	 *
	 * @param amount (amount of coins to reach)
	 * @param unspents (array of Unspent Transactions)
	 * @returns {{unspent: Array<UnspentTX>, total: number}}
	 */
	Wallet.prototype.calculateBestUnspent = function (amount, unspents) {
		// console.log(amount);
		// console.log("calcBestUnspent");
		// console.log(unspents);
		// note: unspents = [ {tx, amount, n, confirmations, script}, ... ]
		// TODO: implement a real algorithm to determine the best unspents
		// e.g. compare the size to the confirmations so that larger coins
		// are used, as well as ones with the highest confirmations.
		unspents.sort(function (a, b) {
			// if (a.confirmations > b.confirmations) {
			//	 return -1;
			// }
			// if (a.confirmations < b.confirmations) {
			//	 return 1;
			// }
			if (a.confirmations && b.confirmations && a.amount > b.amount){
			  return -1;
			}
			if (a.confirmations && b.confirmations && a.amount < b.amount){
			  return 1;
			}
			if (a.confirmations > b.confirmations) {
				return -1;
			}
			if (a.confirmations < b.confirmations) {
				return 1;
			}
			return 0;
		});
		var CutUnspent = [], CurrentAmount = 0;
		for (var v in unspents) {
			// if (parseFloat(unspents[v].amount) > amount) {
			//	 CurrentAmount += parseFloat(unspents[v].amount);
			//	 CutUnspent.push(unspents[v]);
			//	 break;
			// }
			CurrentAmount += parseFloat(unspents[v].amount);
			CutUnspent.push(unspents[v]);
			if (CurrentAmount > amount) {
				break;
			}
		}
		if (CurrentAmount < amount) {
			throw "Not enough coins in unspents to reach target amount";
		}
		return {unspent: CutUnspent, total: CurrentAmount};
	};
	Wallet.prototype.validateKey = function (key, priv) {
		if (priv === void 0) {
			priv = false;
		}
		try {
			var version;
			// are we validating a private key?
			if (priv === true) {
				version = this.coin_network.wif;
			}
			else {
				version = this.coin_network.pubKeyHash;
			}
			var decoded = Bitcoin.base58check.decode(key);
			
			if( this.coin_network == Bitcoin.networks.florincoin && priv == true) {
				// Backwards compatibility for private keys saved under litecoin settings.
				return decoded[0] == Bitcoin.networks.florincoin.wif || decoded[0] == Bitcoin.networks.litecoin.wif
			}
			
			// is this address for the right network?
			return (decoded[0] == version);
		}
		catch (ex) {
			// exceptions mean invalid address
			return false;
		}
	};
	Wallet.prototype.sortTransactions = function (transactions) {
		var allTransactions = [];
		for (var v in transactions) {
			if (transactions[v]) {
				var newTx = transactions[v];
				allTransactions.push(newTx);
			}
		}
		return allTransactions;
	};
	Wallet.prototype.sendCoins = function (fromAddress, toAddress, amount, txComment, pubFee, callback) {
		if (typeof pubFee == "function"){
			callback = pubFee;
			pubFee = 0.01;
		}

		if (typeof txComment == "undefined")
			txComment = '';
		if (typeof txComment == typeof Function) {
			callback = txComment;
			txComment = '';
		}
		if (typeof callback != typeof Function)
			callback = function (err, data) {
			};

		var _this = this;
		if (this.validateKey(toAddress) && this.validateKey(fromAddress)) {
			if (fromAddress in this.addresses && this.validateKey(this.addresses[fromAddress].priv, true)) {
				this.refreshBalances();
				// console.log(this);
				if (this.balances[fromAddress] < amount && this.known_unspent.length <= 0) {
					var event = new CustomEvent('wallet', {'detail': 'balance-too-low'});
					
					window.dispatchEvent(event);
					return;
				}
				this.getUnspent(fromAddress, function (data) {
					var merged = _this.mergeUnspent(data, fromAddress);
					var clean_unspent = _this.removeSpent(merged);
					data = _this.calculateBestUnspent(parseFloat(amount) + parseFloat(pubFee / Math.pow(10, 8)), clean_unspent);
					// console.log(data);
					// temporary constant
					var minFeePerKb = 100000;
					var tx = new Bitcoin.Transaction();
					// IMPORTANT! We're dealing with Satoshis now
					var totalUnspent = parseInt((data.total * Math.pow(10, 8)).toString());
					amount = parseInt((amount * Math.pow(10, 8)).toString());

					// console.log('Sending ' + amount + ' satoshis from ' + fromAddress + ' to ' + toAddress + ' unspent amt: ' + totalUnspent);
					var unspents = data.unspent;
					_this.putSpent.bind(_this);
					_this.tmpPutSpent = [];
					for (var v in unspents) {
						console.log(unspents[v]);
						if (unspents[v].confirmations || unspents[v].confirmations >= 0 || unspents[v].confirmations <= -1) {
							tx.addInput(unspents[v].txid, unspents[v].vout);
							//_this.putSpent(unspents[v]);
							_this.tmpPutSpent.push(unspents[v]);
						}
					}
					if (amount === 1 && toAddress === fromAddress){
						// If we are just sending 1 satoshi and its to ourselves, don't add the tx, else do.
						//tx.addOutput(toAddress, amount);
					} else {
						tx.addOutput(toAddress, amount);
					}
					
					var estimatedFee = _this.coin_network.estimateFee(tx);

					var publishFee = pubFee;

					console.log(publishFee);

					if ((publishFee - parseInt(publishFee)) > 0){
						publishFee = parseInt(parseFloat(pubFee) * Math.pow(10,8));
					}

					if (publishFee > estimatedFee && (amount + publishFee) <= totalUnspent)
						estimatedFee = publishFee;


					if ((amount + estimatedFee) > totalUnspent) {
						var event = new CustomEvent('wallet', {'detail': "Can't fit fee of " + estimatedFee / Math.pow(10, 8) + " - lower your sending amount"});
			
						window.dispatchEvent(event);
						//swal("Error", "Can't fit fee of " + estimatedFee / Math.pow(10, 8) + " - lower your sending amount", "error");
						// console.log('WARNING: Total is greater than total unspent: %s - Actual Fee: %s', totalUnspent, estimatedFee);
						return;
					}

					console.log(totalUnspent, amount, estimatedFee);

					var changeValue = parseInt((totalUnspent - amount - estimatedFee).toString());

					if (amount === 1)
						changeValue--;

					// only give change if it's bigger than the minimum fee
					if (changeValue > 0) {
						tx.addOutput(fromAddress, changeValue);
					}
					tx.ins.forEach(function (input, index) {
						tx.sign(index, new Bitcoin.ECKey.fromWIF(_this.addresses[fromAddress].priv));
					});
					// console.log('Sending amount %s to address %s - Change value: %s - Fee in satoshis: %s - Fee in standard: %s', amount / Math.pow(10, 8), toAddress, changeValue / Math.pow(10, 8), estimatedFee, (estimatedFee / Math.pow(10, 8)));
					var rawHex = tx.toHex();
					// console.log(rawHex);

					// console.log("Comment:");
					// console.log(txComment);

					var lenBuffer = Bitcoin.bufferutils.varIntBuffer(txComment.length);
					var hexComment = '';

					for (var i = 0; i < lenBuffer.length; ++i) {
						hexComment += toHex(lenBuffer[i]);
					}
					for (i = 0; i < txComment.length; ++i) {
						hexComment += toHex(txComment.charCodeAt(i));
					}
					rawHex += hexComment;

					// console.log("Raw");
					// console.log(rawHex);

					_this.pushTX(rawHex, estimatedFee, function (err, data) {
						if (err){
							if (typeof callback == typeof Function)
								callback(err, data);

							return;
						}

						_this.putUnspent.bind(_this);
						_this.putSpent.bind(_this);

						for (var v in _this.tmpPutSpent)
							_this.putSpent(_this.tmpPutSpent[v]);

						// If I'm paying myself it's known_unspent, don't add if amount is one because we removed it up above.
						if (toAddress == fromAddress && amount != 1) {
							_this.putUnspent({
								address: toAddress,
								txid: data.txid,
								vout: 0,
								confirmations: -1,
								amount: amount / Math.pow(10, 8)
							});
						}
						var voutTmp = 1;
						if (amount == 1){
							// Since we did not add the first output, we just have the single vout, thus it should be zero
							voutTmp = 0;
						}
						// Add the change as a known_unspent
						if (changeValue >= minFeePerKb)
							_this.putUnspent({
								address: fromAddress,
								txid: data.txid,
								vout: voutTmp,
								confirmations: -1,
								amount: changeValue / Math.pow(10, 8)
							});
						if (typeof callback == typeof Function)
							callback(null, data);
					});
				});
				this.refreshBalances();
			}
			else {
				var event = new CustomEvent('wallet', {'detail': "You don't own " + fromAddress + "; Cannot send transaciton."});
			
				window.dispatchEvent(event);
				//swal("Error", "You don't own that address!", "error");
			}
		}
		else {
			var event = new CustomEvent('wallet', {'detail': 'Your sending or recipient address is invalid. Please check for any typos'});
			
			window.dispatchEvent(event);
			//swal("Error", 'Your sending or recipient address is invalid. Please check for any typos', "error");
		}
	};
	Wallet.prototype.pushTX = function (tx, pubFee, callback) {
		if (callback === void 0) {
			callback = function (data) {
			};
		}
		var _this = this;

		var options = {rawtx: tx};

		var highFee = false;

		if (pubFee > 10)
			options.highFee = true;

		try {
			$.post(florinsightBaseURL + '/api/tx/send', options, function (data) {
				console.log(data);
				if (!data.txid) {
					Phoenix.wallet.known_unspent = [];
					var event = new CustomEvent('wallet', {'detail': 'txpush-post'});
					
					window.dispatchEvent(event);
					callback(data, undefined);
				} else {
					callback(undefined, data);
				}
				_this.refreshBalances();
			}, "json").fail(function(data){
				callback(data, undefined);

				var event = new CustomEvent('wallet', {'detail': 'txpush-post'});
					
				window.dispatchEvent(event);
			});
		} catch(e){ 
			callback(e, undefined);

			var event = new CustomEvent('wallet', {'detail': 'txpush-post'});
				
			window.dispatchEvent(event);
		}
			
	};
	Wallet.prototype.setBalance = function (address, balance) {
		this.balances[address] = balance;
	};
	/**
	 * getTotalBalance()
	 *
	 * This function returns the total balance calculated
	 * from this.balances; NOTE: It does NOT update the balance
	 * from the server, if you need that, do this.refreshBalances();
	 * before executing this function to get an up to date result.
	 *
	 * ~~Someguy123
	 */
	Wallet.prototype.getTotalBalance = function () {
		var total = 0;
		for (var v in this.balances) {
			var storedBalance = parseFloat(this.balances[v].toString());
			var unspentBal = 0;

			if (this.known_unspent){
				for (var j = 0; j < this.known_unspent.length; j++) {
					if (this.known_unspent[j].address === v){
						var match = false;

						if (this.known_spent){
							for (var k = 0; k < this.known_spent.length; k++) {
								if (this.known_unspent[j] && this.known_spent[k].txid === this.known_unspent[j].txid){  
									match = true;
								}
							}
						}

						if (!match){
							unspentBal += this.known_unspent[j].amount;
						}
					}
				}
			}
			
			var showBalance = 0;

			if (unspentBal != 0){
				showBalance = unspentBal;
			} else {
				showBalance = storedBalance;
			}

			total += showBalance;
		}
		return total;
	};

	Wallet.prototype.signMessage = function (address, message) {
		var privkey = new Bitcoin.ECKey.fromWIF(this.addresses[address].priv);
		var signed_message = Bitcoin.Message.sign(privkey, message, this.coin_network);
		return signed_message.toString('base64');
	};

	/**
	 * wallet_serialize()
	 *
	 * Returns the JSON version of the wallet, including
	 * only the necessities, such as the shared key,
	 * addresses, labels, and private keys
	 *
	 * @param prettify
	 * @returns {string}
	 */
	Wallet.prototype.wallet_serialize = function (prettify) {
		if (prettify === void 0) {
			prettify = false;
		}
		var walletdata = ({
			shared_key: this.shared_key,
			addresses: this.addresses
		});
		if (prettify) {
			return JSON.stringify(walletdata, null, "\t");
		}
		else {
			return JSON.stringify(walletdata);
		}
	};

	return Wallet;
})();

// $('#login-btn').click(function () {
// 	var identifier = $('#identifier-txt').val(), password = $('#password-txt').val();
// 	$.cookie('identifier', identifier);
// 	wallet = new Wallet(identifier, password);
// 	$.get('/wallet/checkload/' + identifier, function (data) {
// 		if (data.error) {
// 			swal("Error", 'Error loading wallet: ' + data.error.message, "error");
// 		}
// 		else {
// 			// console.log(data);

// 			// note: if 2FA is disabled, this will also be true
// 			if (data.auth_key_isvalid === true) {
// 				initializeWallet(wallet);
// 			}
// 		}
// 	}, "json").fail(function () {
// 		swal("Error", 'Could not load wallet', "error");
// 	});
// });

function toHex(d) {
	return ("0" + (Number(d).toString(16))).slice(-2).toUpperCase()
}

window.addEventListener('wallet', function (e) { 
	console.log(e);
}, false);
