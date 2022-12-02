/*
	Author:
		Ramzi Sah#2992
	Desription:
		main bot code for game status discord bot (gamedig) - https://discord.gg/vsw2ecxYnH
	Updated:
		20220403 - soulkobk, updated player parsing from gamedig, and various other code adjustments
*/

// read configs
const fs = require('fs');
var config = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf8'));

// await for instance id
var instanceId = -1;

process.on('message', function(m) {
	// get message type
	if (Object.keys(m)[0] == "id") {
		// set instance id
		instanceId = m.id
		
		// send ok signal to main process
		process.send({
			instanceid : instanceId,
			message : "STARTED: instance started."
		});
		
		// init bot
		init();
	};
});

function init() {
	// get config
	config["instances"][instanceId]["webServerHost"] = config["webServerHost"];
	config["instances"][instanceId]["webServerPort"] = config["webServerPort"];
	config["instances"][instanceId]["statusUpdateTime"] = config["statusUpdateTime"];
	config["instances"][instanceId]["timezone"] = config["timezone"];
	config["instances"][instanceId]["format24h"] = config["format24h"];
	config = config["instances"][instanceId];
	
	// connect to discord API
	client.login(config["discordBotToken"]);
};

//----------------------------------------------------------------------------------------------------------
// common
function Sleep(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
};

//----------------------------------------------------------------------------------------------------------
// create client
require('dotenv').config();
const {Client, MessageEmbed, Intents, MessageActionRow, MessageButton} = require('discord.js');
const client = new Client({
	messageEditHistoryMaxSize: 0,
	intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]
});

//----------------------------------------------------------------------------------------------------------
// on client ready
client.on('ready', async () => {
	process.send({
		instanceid : instanceId,
		message : "SUCCESS: logged in as \"" + client.user.tag + "\"."
	});
	
	// wait until process instance id receaived
	while (instanceId < 0) {
		await Sleep(1000);
	};
	
	// get broadcast chanel
	let statusChannel = client.channels.cache.get(config["serverStatusChannelID"]);
	
	if (statusChannel == undefined) {
		process.send({
			instanceid : instanceId,
			message : "ERROR: channel id " + config["serverStatusChannelID"] + ", does not exist."
		});
		return;
	};
	
	// search for existing message id from config.json serverStatusMessageID entry - soulkobk
	let statusMessage = undefined;
	let statusMessageID = config["serverStatusMessageID"];
	await statusChannel.messages.fetch({ limit: 100 }).then(messages => {
		let count = 0;
		let max = (JSON.parse(JSON.stringify(messages)).length);
		for (i = 0; i < max; i++) {
			let discordMessageID = (JSON.parse(JSON.stringify(messages))[i].id);
			if (statusMessageID === discordMessageID) {
				statusMessage = messages.get(discordMessageID);
				return;
			};
		};
	});
	
	// if existing message not found, create a new one... - soulkobk
	if (statusMessage == undefined) {
		statusMessage = await createStatusMessage(statusChannel);
		if (statusMessage == undefined) {
			process.send({
				instanceid : instanceId,
				message : "ERROR: could not send the status message."
			});
			return;
		};
		process.send({
			instanceid : instanceId,
			message : "UPDATE: please update config.json 'serverStatusMessageID' entry from '" + config["serverStatusMessageID"] + "' to '" + statusMessage.id + "'"
		});
	};
	
	startStatusMessage(statusMessage);
	generateGraph();

});

//----------------------------------------------------------------------------------------------------------
//----------------------------------------------------------------------------------------------------------
// create/get last status message
async function createStatusMessage(statusChannel) {

	// create new message
	let embed = new MessageEmbed();
	embed.setTitle("instance starting...");
	embed.setColor('#ffff00');

	return await statusChannel.send({ embeds: [embed] }).then((sentMessage)=> {
		return sentMessage;
	});	
};

function clearOldMessages(statusChannel, nbr) {
	return statusChannel.messages.fetch({limit: 99}).then(messages => {
		// select bot messages
		messages = messages.filter(msg => (msg.author.id == client.user.id && !msg.system));
		
		// keep track of all promises
		let promises = [];
		
		// delete messages
		let i = 0;
		messages.each(mesasge => {
			// let nbr last messages
			if (i >= nbr) {
				// push to promises
				promises.push(
					mesasge.delete().catch(function(error) {
						return;
					})
				);
			};
			i += 1;
		});
		
		// return when all promises are done
		return Promise.all(promises).then(() => {
			return;
		});
		
	}).catch(function(error) {
		return;
	});
};

function getLastMessage(statusChannel) {
	return statusChannel.messages.fetch({limit: 20}).then(messages => {
		// select bot messages
		messages = messages.filter(msg => (msg.author.id == client.user.id && !msg.system));
		
		// return first message
		return messages.first();
	}).catch(function(error) {
		return;
	});
};

//----------------------------------------------------------------------------------------------------------
//----------------------------------------------------------------------------------------------------------
// main loops
async function startStatusMessage(statusMessage) {
	while(true){
		try {
			// steam link button
			let row = new MessageActionRow()
			row.addComponents(
				new MessageButton()
					.setCustomId('steamLink')
					.setLabel('Connect')
					.setStyle('PRIMARY')
			);
		
			let embed = await generateStatusEmbed();
			statusMessage.edit({ embeds: [embed], components: config["steam_btn"] ? [row] : [] });
		} catch (error) {
			process.send({
				instanceid : instanceId,
				message : "ERROR: could not edit status message. " + error
			});
		};

		await Sleep(config["statusUpdateTime"] * 1000);
	};
};

client.on('interactionCreate', interaction => {
	if (!interaction.isButton()) return;
	
	interaction.reply({ content: 'steam://connect/' + config["server_host"] + ':' + config["server_port"], ephemeral: true });
});

//----------------------------------------------------------------------------------------------------------
// fetch data
const gamedig = require('gamedig');
var tic = false;
function generateStatusEmbed() {
	let embed = new MessageEmbed();
	
	// set embed name and logo
	embed.setAuthor({ name: '', iconURL: '', url: '' })
	
	// set embed updated time
	tic = !tic;
	let ticEmojy = tic ? "⚪" : "⚫";
	
	let updatedTime = new Date();

	updatedTime.setHours(updatedTime.getHours() + config["timezone"][0] - 1);
	updatedTime.setMinutes(updatedTime.getMinutes() + config["timezone"][1]);
	
	let footertimestamp = ticEmojy + ' ' + "Last Update" + ': ' + updatedTime.toLocaleTimeString('en-US', {hour12: !config["format24h"], month: 'short', day: 'numeric', hour: "numeric", minute: "numeric"})
	embed.setFooter({ text: footertimestamp, iconURL: '' });
	
	try {
		return gamedig.query({
			type: config["server_type"],
			host: config["server_host"],
			port: config["server_port"],

			maxAttempts: 5,
			socketTimeout: 1000,
			debug: false
		}).then((state) => {
			
			//-----------------------------------------------------------------------------------------------
			// soulkobk edit 20220406 - updated 'players' objects to found/defined keys for use with dataKeys parsing
			let oldplayers = state.players;
			delete state["players"];
			Object.assign(state, {players: []});
			for (let p = 0; p < oldplayers.length; p++) {
				playerobject = Object.create({});
				let rank = p + 1 > 9 ? p + 1 : "0" + (p + 1);
				playerobject.rank = rank;
				var playername = oldplayers[p].name;
				if (playername != undefined || playername != "") {
					playerobject.name = playername;
				};
				var playertime = oldplayers[p].raw.time;
				if (playertime != undefined) {
					playerobject.time = playertime;
				};
				var playerscore = oldplayers[p].raw.score;
				if (playerscore != undefined) {
					playerobject.score = playerscore;
				};
				var playerping = oldplayers[p].raw.ping;
				if (playerping != undefined) {
					playerobject.ping = playerping;
				};
				state.players.push(playerobject);
			};
			if (config["server_sortby_score"]) {
				state.players.sort(sortBy('score', true, parseInt));
			};
			if (config["server_sortby_ping"]) {
				state.players.sort(sortBy('ping', false, parseInt));
			};
			//-----------------------------------------------------------------------------------------------
			
			// set embed color
			embed.setColor(config["server_color"]);
			
			//-----------------------------------------------------------------------------------------------
			// set server name
			let serverName = state.name.toUpperCase();
			
			// refactor server name
			for (let i = 0; i < serverName.length; i++) {
				if (serverName[i] == "^") {
					serverName = serverName.slice(0, i) + " " + serverName.slice(i+2);
				} else if (serverName[i] == "█") {
					serverName = serverName.slice(0, i) + " " + serverName.slice(i+1);
				} else if (serverName[i] == "�") {
					serverName = serverName.slice(0, i) + " " + serverName.slice(i+2);
				};
			};
			
			serverName = serverName.substring(0,45) + "...";
			
			let stringlength = 0;
			let stringpadding = 0;
			let stringtext = "";
			
			stringlength = serverName.length;
			stringpadding = ((45 - stringlength) / 2 );
			serverName = serverName.padStart((stringlength + stringpadding), '\u3000');
			serverName = (serverName.padEnd(stringlength + (stringpadding * 2),'\u3000'));
			
			embed.setTitle(serverName);
			
			//-----------------------------------------------------------------------------------------------
			// basic server info
			if (config["server_enable_headers"]) {
				stringtext = " S E R V E R   D E T A I L S  ";
				stringlength = stringtext.length;
				stringpadding = ((config["server_header_padding"] - stringlength) / 2 );
				stringtext = stringtext.padStart((stringlength + stringpadding), '\u3000');
				stringtext = (stringtext.padEnd(stringlength + (stringpadding * 2),'\u3000'));
				embed.addField('\u200B', '`' + `${stringtext}` + '`');
			};
			
			embed.addField("Status" + ' :', "🟢 " + "Online", true);
			embed.addField("Direct Connect" + ' :', state.connect, true);
			embed.addField("Location" + ' :', `:flag_${config["server_country"].toLowerCase()}:`, true);
			// embed.addField("Game Mode" + ' :', config["server_type"].charAt(0).toUpperCase() + config["server_type"].slice(1) , true);
			embed.addField("Server" + ' :', config["server_game"].charAt(0).toUpperCase() + config["server_game"].slice(1) , true);
			if (state.map == "") {
				embed.addField("\u200B", "\u200B", true);
			} else {
				embed.addField("Map" + ' :', state.map.charAt(0).toUpperCase() + state.map.slice(1), true);
			};
			embed.addField("Online Players" + ' :', state.players.length + " / " + state.maxplayers, true);
			
			//-----------------------------------------------------------------------------------------------
			// player list
			let players_online = 0;
			if (config["server_enable_playerlist"] && state.players.length == 0) {
				state.players.push({name: '\u3000'});
			};

			if (config["server_enable_playerlist"] && state.players.length > 0) {
				
				if (config["server_enable_headers"]) {
					stringtext = "     P L A Y E R   L I S T    ";
					stringlength = stringtext.length;
					stringpadding = ((config["server_header_padding"] - stringlength) / 2 );
					stringtext = stringtext.padStart((stringlength + stringpadding), '\u3000');
					stringtext = (stringtext.padEnd(stringlength + (stringpadding * 2),'\u3000'));
					embed.addField('\u200B', '`' + `${stringtext}` + '`');
				};
				
				// recover game data
				let dataKeys = Object.keys(state.players[0]);

				// remove some unwanted data
				dataKeys = dataKeys.filter(e =>
					e !== 'frags' && 
					e !== 'raw' && 
					e !== 'guid' && 
					e !== 'id' && 
					e !== 'team' &&
					e !== 'squad' &&
					e !== 'skin'
				);
				
				if (!config["server_enable_rank"]) {
					dataKeys = dataKeys.filter(e =>
						e !== 'rank'
					);
				};
				
				if (!config["server_enable_time"]) {
					dataKeys = dataKeys.filter(e =>
						e !== 'time'
					);
				};
				
				if (!config["server_enable_score"]) {
					dataKeys = dataKeys.filter(e =>
						e !== 'score'
					);
				};
								
				if (!config["server_enable_ping"]) {
					dataKeys = dataKeys.filter(e =>
						e !== 'ping'
					);
				};
				
				for (let j = 0; j < dataKeys.length; j++) {
					// check if data key empty
					if (dataKeys[j] == "") {
						dataKeys[j] = "\u200B";
					};
					let player_datas = "```\n";
					for (let i = 0; i < state.players.length; i++) {
						// break if too many players, prevent discord message overflood
						if (i + 1 > 50) {
							player_datas += "...";
							break;
						};
						// set player data
						if (state.players[i][dataKeys[j]] != undefined) {
							let player_data = state.players[i][dataKeys[j]].toString();
							if (player_data == "") {
								player_data = "-";
							};
							// --------------------------------------------------------------------
							// handle discord markdown strings
							player_data = player_data.replace(/_/g, " ");
							for (let k = 0; k < player_data.length; k++) {
								if (player_data[k] == "^") {
									player_data = player_data.slice(0, k) + " " + player_data.slice(k+2);
								};
							};
							// --------------------------------------------------------------------
							// filter rank
							if (dataKeys[j] == "rank") {
								let rank = i + 1 > 9 ? i + 1 : "0" + (i + 1);
								player_datas += rank;
							};
							// --------------------------------------------------------------------
							// filter name
							if (dataKeys[j] == "name") {
								if (player_data == '\u3000') {
									if (config["server_enable_numbers"]) {
										player_datas += "00 - " + player_data;
									} else {
										player_datas += player_data;
									};
									players_online = 0;
								} else {
									player_data = (player_data.length > 16) ? player_data.substring(0, 16 - 3) + "..." : player_data;
									if (config["server_enable_numbers"]) {
										let index = i + 1 > 9 ? i + 1 : "0" + (i + 1);
										player_datas += j == 0 ? index +  " - " + player_data : player_data;
									} else {
										player_datas += player_data;
									};
									players_online = state.players.length;
								};
							};
							// --------------------------------------------------------------------
							// filter time
							if (dataKeys[j] == "time") {
								let time = state.players[i].time;
								if (typeof time == 'number' && !isNaN(time)) {
									let date = new Date(state.players[i].time * 1000).toISOString().substr(11,8);
									player_datas += date;
								};
							};
							// --------------------------------------------------------------------
							// filter score
							if (dataKeys[j] == "score") {
								let score = state.players[i].score;
								player_datas += score;
							}
							// --------------------------------------------------------------------
							// filter ping
							if (dataKeys[j] == "ping") {
								let ping = state.players[i].ping;
								player_datas += ping + " ms";
							}
							// --------------------------------------------------------------------
						};
						player_datas += "\n";
					};
					player_datas += "```";
					
					dataKeys[j] = dataKeys[j].charAt(0).toUpperCase() + dataKeys[j].slice(1);
					embed.addField(dataKeys[j] + ' :', player_datas, true);
				};
			};
			
			// add graph data
			graphDataPush(updatedTime, players_online);

			// set graph image
			if (config["server_enable_graph"]) {
				if (config["server_enable_headers"]) {
					stringtext = "    P L A Y E R   G R A P H   ";
					stringlength = stringtext.length;
					stringpadding = ((config["server_header_padding"] - stringlength) / 2 );
					stringtext = stringtext.padStart((stringlength + stringpadding), '\u3000');
					stringtext = (stringtext.padEnd(stringlength + (stringpadding * 2),'\u3000'));
					embed.addField('\u200B', '`' + `${stringtext}` + '`');
				};

				embed.setImage(
					"http://" + config["webServerHost"] + ":" + config["webServerPort"] + "/" + 'graph_' + instanceId + '.png' + "?id=" + Date.now()
				);
			};
			
			return embed;
		}).catch(function(error) {
			
			// offline status message
			embed.setColor('#ff0000');
			embed.setTitle('🔴 ' + "Server Offline" + '.');

			// add graph data
			graphDataPush(updatedTime, 0);

			return embed;
		});
	} catch (error) {
		console.log(error);
		
		// offline status message
		embed.setColor('#ff0000');
		embed.setTitle('🔴 ' + "Server Offline" + '.');

		// add graph data
		graphDataPush(updatedTime, 0);

		return embed;
	};
};

function graphDataPush(updatedTime, nbrPlayers) {
	// save data to json file
	fs.readFile(__dirname + '/temp/data/serverData_' + instanceId + '.json', function (err, data) {
		// create file if does not exist
		if (err) {
			fs.writeFile(__dirname + '/temp/data/serverData_' + instanceId + '.json', JSON.stringify([]),function(err){if (err) throw err;});
			return;
		};
		
		let json;
		// read old data and concat new data
		try {
			json = JSON.parse(data);
		} catch (err) {
			console.log("error on graph data")
			console.error(err)
			json = JSON.parse("[]");
		};
		
		// 1 day history
        let nbrMuchData = json.length - 24 * 60 * 60 / config["statusUpdateTime"];
        if (nbrMuchData > 0) {
            json.splice(0, nbrMuchData);
        };
		
		json.push({"x": updatedTime, "y": nbrPlayers});
		
		// rewrite data file 
		fs.writeFile(__dirname + '/temp/data/serverData_' + instanceId + '.json', JSON.stringify(json), function(err){});
	});
};

const width = 600;
const height = 300;

const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
var canvasRenderService = new ChartJSNodeCanvas({width, height});

async function generateGraph() {
	while(true){
		try {

			// generate graph
			let data = [];

			try {
				data = JSON.parse(fs.readFileSync(__dirname + '/temp/data/serverData_' + instanceId + '.json', {encoding:'utf8', flag:'r'}));
			} catch (error) {
				data = [];
			}

			let graph_labels = [];
			let graph_datas = [];
			
			// set data
			for (let i = 0; i < data.length; i += 1) {
				graph_labels.push(new Date(data[i]["x"]));
				graph_datas.push(data[i]["y"]);
			};

			let graphConfig =  {
				type: 'line',
				
				data: {
					labels: graph_labels,
					datasets: [{
						label: 'number of players',
						data: graph_datas,
						
						pointRadius: 0,
						
						backgroundColor: hexToRgb(config["server_color"], 0.2),
						borderColor: hexToRgb(config["server_color"], 1.0),
						borderWidth: 1
					}]
				},
				
				options: {
					downsample: {
						enabled: true,
						threshold: 500 // max number of points to display per dataset
					},
					
					legend: {
						display: true,
						labels: {
							fontColor: 'white'
						}
					},
					scales: {
						yAxes: [{
							ticks: {
								fontColor: 'rgba(255,255,255,1)',
								precision: 0,
								beginAtZero: true
							},
							gridLines: {
								zeroLineColor: 'rgba(255,255,255,1)',
								zeroLineWidth: 0,
								
								color: 'rgba(255,255,255,0.2)',
								lineWidth: 0.5
							}
						}],
						xAxes: [{
							type: 'time',
							ticks: {
								fontColor: 'rgba(255,255,255,1)',
								autoSkip: true,
								maxTicksLimit: 10
							},
							time: {
								displayFormats: {
									quarter: 'h a'
								}
							},
							gridLines: {
								zeroLineColor: 'rgba(255,255,255,1)',
								zeroLineWidth: 0,
								
								color: 'rgba(255,255,255,0.2)',
								lineWidth: 0.5
							}
						}]
					},
					datasets: {
						normalized: true,
						line: {
							pointRadius: 0
						}
					},
					elements: {
						point: {
							radius: 0
						},
						line: {
							tension: 0
						}
					},
					animation: {
						duration: 0
					},
					responsiveAnimationDuration: 0,
					hover: {
						animationDuration: 0
					}
				}
			};

			let graphFile = 'graph_' + instanceId + '.png';
			
			canvasRenderService.renderToBuffer(graphConfig).then(data => {
				fs.writeFileSync(__dirname + '/temp/graphs/' + graphFile, data);
			}).catch(function(error) {
				console.error("graph creation for guild " + instanceId + " failed.");
				console.error(error);
			});

		} catch (error) {
			console.error(error);
			process.send({
				instanceid : instanceId,
				message : "could not generate graph image " + error
			});
		};

		await Sleep(60 * 1000); // every minute
	};
};

// does what its name says
function hexToRgb(hex, opacity) {
	var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	return result ? "rgba(" + parseInt(result[1], 16) + ", " + parseInt(result[2], 16) + ", " + parseInt(result[3], 16) + ", " + opacity + ")" : null;
};

const sortBy = (field, reverse, primer) => {
	const key = primer ?
	function(x) {
		return primer(x[field])
	} :
	function(x) {
		return x[field]
	};
	reverse = !reverse ? 1 : -1;
	return function(a, b) {
		return a = key(a), b = key(b), reverse * ((a > b) - (b > a));
	};
};
