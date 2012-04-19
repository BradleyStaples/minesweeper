/* NOTES:
	Save/load are rudimentary as they only allow one game to be saved at a time. The load always loads that same game.
	Ideally, the save dialog would allow the user to enter a name for the saved game and use that (sanitized) as the
	key name for local storage, and the load dialog would allow the user to choose which game to load. This would have
	to take into effect over-riding game saves as well. I didn't do this on purpose, as I don't honestly see anyone
	saving that many variations of a game as simple as MineSweeper. The save also cheats a bit by saving the entire
	HTML table as data as opposed to stripping just the essential data out and saving the JSON (allowing for cleaner,
	smaller save files). This is again because only one save would exist so there won't be much data saved on the user's
	PC.

	Initially I had the objects saved into the data.grid array much more robust with as a constructor function with
	closures. I ran into a problem, however, when I started using local storage to save the game. Local storage only
	saves as strings, and even when using JSON.stringify() and JSON.parse(), the closures are lost, so that after
	loading a game no cells would indicate correctly if they had a mine or not. As the only true piece of info that needs
	to be concealed as the state of a cell having a mine or not, I chose to use a simple object instead even though the
	object.mined property can be overwritten from anywhere within the script.

	If you don't read the help dialog, just realize that shift-clicking flags a cell to hold a mine. Enjoy!

	The game works in all modern browsers. <IE8 won't be able to load/save. Various versions of IE looks less pretty due
	to lack of some CSS3 features such as gradients, box-shadows, and rounded corners.
*/
(function ($) {
	"use strict";
	var bindings, data, elements, events, utility;

	// jquery bindings for most elements. there are a few that aren't live
	// on page load that are bound/unbound as needed elsewhere
	bindings = {
		// the buttons in the main nav area
		clickButtons : function () {
			elements.buttons.cheat.click(events.cheat);
			elements.buttons.help.click(events.modal.help);
			elements.buttons.load.click(events.load);
			elements.buttons.save.click(events.save);
			elements.buttons.start.click(events.modal.start);
			elements.buttons.validate.click(events.validate);
		},
		// base game mechanic for the game's cells (td's)
		clickCell : function () {
			var selector = "td." + data.classes.unknown + ", td." + data.classes.flagged;
			elements.grid.delegate(selector, "click", function (event) {
				events.cellClicked(event, $(this));
			});
		},
		// unbind the base game mechanic when an init (for new game or load) occurs to prevent duplicate binds
		// also removes the pointer cursor via CSS since they are no longer clickable
		clickCellUnbind : function () {
			var selector = "td." + data.classes.unknown + ", td." + data.classes.flagged;
			elements.grid.undelegate(selector, "click").find("td").css("cursor", "default");
		},
		// binding called whenever a modal window appears to allow it be closed via ESC
		modalClose : function () {
			$(document).keyup(function (event) {
				// 27 is escape key
				if (event.which === 27) {
					events.modal.close();
				}
			});
		},
		// unbind the modal close via ESC, will be called after the modal dialog is closed
		modalUnbind : function () {
			$(document).unbind("keyup");
		}
	};

	// repeatedly access data used throughout the game
	data = {
		// boolean flag to determine if a game is active (e.g., being played)
		active : false,
		// classes used by CSS to control apperance
		classes : {
			cheat : "dirtycheater",
			empty : "empty",
			flagged : "flagged",
			mined : "mined",
			miss : "miss",
			sprite : "sprite",
			unknown : "unknown"
		},
		// used to determine the 8 adjacent cells
		directions : [
			// skip 0, 0 since it would be the current cell
			{x: -1, y: +0},	// left center
			{x: -1, y: +1},	// top left
			{x: +0, y: +1},	// top center
			{x: +1, y: +1},	// top right
			{x: +1, y: +0},	// right center
			{x: +1, y: -1},	// bottom right
			{x: +0, y: -1},	// bottom center
			{x: -1, y: -1}	// bottom left;
		],
		// grid will be an array of objects representing the clickable cells
		grid : null,
		// stats and metrics used to determine gameplay and update stats visual display
		stats : {
			clicks : 0,
			cols : 8,
			// mines only changes if a user enters a different number. this value
			// does NOT change during gameplay / game creation
			mines : 10,
			// used to plant the correct number of mines and also modified to show
			// mines in active game that aren't flagged
			minesPlanted : 0,
			rows : 8,
			seconds : 0
		},
		// timer will be a reference to setInterval to keep track of clock
		timer : null
	};

	// saving jQuery element selectors to prevent re-querying them
	elements = {
		// selectors for the main nav's buttons
		buttons : {
			cheat : $(".cheat"),
			help : $(".help"),
			load : $(".load"),
			save : $(".save"),
			start : $(".start"),
			validate : $(".validate")
		},
		// the main gameplay grid
		grid : $(".grid"),
		// modal dialog and overlay (screen behind modal dialog)
		modal : $(".modal"),
		overlay : $(".overlay"),
		// stats visual area
		stats : {
			clicks : $(".clicks"),
			mines : $(".mines"),
			seconds : $(".time"),
			statistics : $(".stats")
		},
		// td called as function to select a specific TD within grid
		td : function (row, col) {
			// nth child is index-1 based, not zero. must add 1 to row/col passed in.
			var r = row + 1,
				c = col + 1;
			return $(".grid tr:nth-child(" + r + ")>td:nth-child(" + c + ")");
		},
		// templates in custom <script> tags used for modal dialogs
		templates : {
			confirm : $("#modal-confirm"),
			help : $("#modal-help"),
			notice : $("#modal-notice"),
			start : $("#modal-start"),
			// td is unique in that it is used for the main game area and not a modal dialog
			td : $("#grid-td")
		}
	};

	// the bulk of the JavaScript, these events are directly called by user action
	events = {
		// event fired when user clicks on a TD (cell)
		// @event : jQuery event object, used to determine if shift key was depresedd
		// @$this : jQuery reference to the TD cell clicked
		cellClicked : function (event, $td) {
			// get the row and column from the data- attributes on the TD cell
			var r = $td.data("row"),
				c = $td.data("col"),
				// get the specific array index for these coords
				currentCell = utility.getCell(r, c),
				// defalt the number of surrounding cells with mines to 0
				num = 0,
				// default the action to assume the user did not click on a cell with a mine
				clickedMine = false,
				// an array of classes used in CSS to display the number of adjacent mines (if not 0)
				classes = ["", "one", "two", "three", "four", "five", "six", "seven", "eight"];
			// incremement the number of clicks a user has made
			data.stats.clicks += 1;
			// verify that this array element exists
			if (currentCell) {
				// determine if the user was holding the shift key during the click
				if (event.shiftKey) {
					// user was holding shift key, so this is a flag/unflag action
					// remove the unknown flag and add the sprite flag (indicating it will use the CSS sprite)
					$td.removeClass(data.classes.unknown).addClass(data.classes.sprite);
					// determine if the cell was previously flagged
					if ($td.hasClass(data.classes.flagged)) {
						// cell was previously flagged, need to unflag and add a mine to stats data for visual
						$td.removeClass(data.classes.flagged).addClass(data.classes.unknown);
						data.stats.minesPlanted += 1;
					} else {
						// cell was NOT previously flagged, need to flag and remove a mine from stats data for visual
						$td.addClass(data.classes.flagged);
						data.stats.minesPlanted -= 1;
					}
				} else {
					// user was not holding the shift key, this is a regular reveal action
					// determine if this cell had a mine
					if (!currentCell.mined) {
						// this cell did not have a mine, get the number of mines in adjacent cells
						num = utility.countSurroundingMines(r, c);
						// determine if the number of adjacenent mines was 0 or not
						if (num === 0) {
							// 0 adjacent mines, so no number displayed (no further classes added). keep revealing empty squares
							// via recursive function revealEmptyAdjacent() until no more empty cells are adjacent. recursive function
							// handles class additions as needed for these cells
							utility.revealEmptyAdjacent(r, c);
						} else {
							// >0 adjacent mines. add the appropriate class (remove unknown, add empty and sprite plus the specific number class needed)
							$td.removeClass(data.classes.unknown).addClass(data.classes.sprite + " " + data.classes.empty + " " + classes[num]);
						}
					} else {
						// a cell with a mine was clicked. boom!
						// add the classes to display the mine
						$td.addClass(data.classes.mined + " " + data.classes.sprite);
						// end the game by calling validation
						events.validate();
						// flag that this event clicked a cell with a mine to prevent possible duplicate validations
						clickedMine = true;
					}
				}
				// checking to see if a mine was just clicked and that the game is still active to prevent
				// duplicate validate() calls. will occur if there the remaining 'unknown' cells are < remaining unaccounted minesPlanted
				if (!clickedMine && utility.isGameActive()) {
					// see if all mine flags have been placed, if so the user thinks he has them all marked and auto validate
					if (data.stats.minesPlanted === 0) {
						events.validate();
					}
					// see if the number of flagged cells + remaining unknown are less than total mines. if so, only mines cells
					// should remain, so auto validate
					if ($("td." + data.classes.unknown).length <= data.stats.minesPlanted) {
						events.validate();
					}
				}
			}
			// after each click, update stats to display new metrics
			events.updateStats();
		},
		// fired when user clicks the cheat button in main nav
		cheat : function () {
			// make sure the game is active
			if (utility.isGameActive()) {
				// game is active. show a prompt to allow the cheater to change his mind and still have honor =)
				// more realistically, displays how the cheat actually occurs
				var msg = "Cheating is a dirty habit, you know.</p>";
				msg += "<p>If you're sure you want to cheat, I won't tell... All cells that contain";
				msg += " mines will be outlined in red so you won't get your cheating dainty hands dirty.";
				events.modal.confirm(msg, events.cheatGame);
			} else {
				// display an notice dialog announcing that cheating cannot be done at this time since no game is being played
				events.modal.notice("Error", "You must be actively playing a game in order to <strong>cheat</strong>.");
			}
		},
		// fired when user confirms via modal dialog that they want to cheat.
		cheatGame : function () {
			// close modal dialog
			events.modal.close();
			// reveal all mined cells for the cheater
			// iterate through each TD cell
			$("td").each(function () {
				var $td = $(this),
					// get the row (r) and col (c) values from the data- attributes
					r = $td.data("row"),
					c = $td.data("col"),
					// get the array element matching these coords
					cellToCheck = utility.getCell(r, c);
				// if this cell has a mine, add the class to show the cheating visual
				if (cellToCheck.mined) {
					$td.addClass(data.classes.cheat);
				}
			});
		},
		// init is fired when a new game is started or a saved game is loaded
		// @savedData : object (saved game data), only passed in from loading a saved game
		//				new game inits will NOT have a savedData object passed in
		init : function (savedData) {
			// this may not be the first game played. (new game hit more than once, or new game then a loaded game, etc)
			// reset game data to be safe
			// unbind the click cell events to prevent duplicate bindings via jQuery delegate
			bindings.clickCellUnbind();
			// clear the timer
			window.clearInterval(data.timer);
			// remove any previous game result (win/lose) messages
			$(".gameresult").remove();
			// determine if this game is being loaded from a save or new
			if (savedData) {
				// game is loaded from a save. assign all metrics from saved game data object
				data.stats.clicks = savedData.gamestats.clicks;
				data.stats.cols = savedData.gamestats.cols;
				data.stats.mines = savedData.gamestats.mines;
				data.stats.minesPlanted = savedData.gamestats.minesPlanted;
				data.stats.rows = savedData.gamestats.rows;
				data.stats.seconds = savedData.gamestats.seconds;
				// assign previously created grid (array of objects)
				data.grid = savedData.gamegrid;
				// the table's html is saved as well, redisplay that table
				elements.grid.html(savedData.gametable);
			} else {
				// game is a new. reset all metrics and data values to starting defaults.
				data.stats.clicks = 0;
				data.stats.cols = 8;
				data.stats.mines = 10;
				data.stats.minesPlanted = 0;
				data.stats.rows = 8;
				data.stats.seconds = 0;
				data.grid = null;
				data.active = false;
				// build the grid (array of objects) representing the TD cells
				utility.generateGrid();
				// randomly plant mines in grid
				utility.plantAllMines();
				// build the HTML table
				utility.buildGrid();
				// hide the modal dialog displayed for a new game start
				elements.overlay.fadeOut("fast");
			}
			// show the html table and stats area
			elements.grid.show();
			elements.stats.statistics.show();
			// bind the table cell clicks
			bindings.clickCell();
			// start the timer to keep track of # of seconds
			data.timer = setInterval(events.updateClock, 1000);
			// update the stats. this sets default values for a new game, or shows values as saved from a load
			events.updateStats();
			// set the gameplay flag to active/true to show a game is being played
			data.active = true;
		},
		// load is called when user clicks load game button in main nav
		load : function () {
			// determine if a game is in progress
			if (utility.isGameActive()) {
				// if a game is in progress, verify that user wants to quit it and load previously saved game
				events.modal.confirm("Are you sure you wish to stop the current game and load a new one?", events.loadGame);
			} else {
				// no game is active, preceed to load game
				events.loadGame();
			}
		},
		// called from load() above when user clicks load button in main nav and no game is active
		// or if a game is active and user confirms via modal dialog to load anyways
		loadGame : function () {
			var savedGame, store;
			// close the modal dialog if it is open for confirmation, otherwise has no effect
			events.modal.close();
			// verify user's browser supports local storage
			if (window.localStorage) {
				// browser supports local storage
				store = window.localStorage;
				// verify that a saved game exists
				if (store.save) {
					// load the saved game (which is stored as JSON) and parse it
					savedGame = JSON.parse(store.save);
					// display a modal dialog showing confirmation of load. this is somewhat annoying but otherwise
					// user may not realize a new game is loaded if they were playing a game previously.
					events.modal.notice("Load Successful", "Your previously saved game has successfully been loaded");
					// init the saved game
					events.init(savedGame);
				} else {
					// user has no saved game to load, display a notice via modal dialog
					events.modal.notice("Error", "You do not have any saved games to <strong>load</strong>...");
				}
			} else {
				// users browser does not support local storage, display a notice via modal dialog
				events.modal.notice("Error", "Saving &amp; loading was implemented with localstorage. Your browser does not support this feature and is unable to load/save.");
			}
		},
		// controls opening and closing of modal dialogs. not directly called from user input per se
		// but still fits here better than than under utility
		modal : {
			// close the modal dialog
			close : function () {
				// hide the modal dialog
				elements.overlay.fadeOut("fast");
				// unbind the escape key
				bindings.modalUnbind();
			},
			// used to display confirmation dialog with "Cancel" and "Continue buttons".
			// Cancel closes dialog with no effect.
			// @message : string of text to display to user
			// @func : function, callback function to invoke if user clicks "Continue"
			confirm : function (message, func) {
				// get the html of the confirm dialog template and place in custom message
				var contents = elements.templates.confirm.html().replace("{{message}}", message);
				// assign that html to the modal dialog
				elements.modal.html(contents);
				// display the modal dialog
				events.modal.open(func);
			},
			// called when user clicks the help button in main nav
			help : function () {
				// load the contents of the help dialog template and place it into modal dialog
				// it has a lot more content than the standard notice/confirm dialogs
				elements.modal.html(elements.templates.help.html());
				// display the modal dialog
				events.modal.open();
			},
			// used to display a notice with a "Close" button, typically is an error
			// @title : string of text to go into an H2 Tag
			// @message : string of text to display to user
			notice : function (title, message) {
				// get the contents of the notice dialog template and insert the title and message
				var contents = elements.templates.notice.html().replace("{{title}}", title).replace("{{message}}", message);
				// assign that html to the modal dialog
				elements.modal.html(contents);
				// display the modal dialog
				events.modal.open();
			},
			// used to open modal dialogs
			// @func : function. optional callback, only used for confirm dialogs
			open : function (func) {
				// see if callback function was passed in
				if (func) {
					// callback function exists
					// display modal dialog
					elements.overlay.fadeIn("fast", function () {
						// bind the close button to hide the dialog
						$(".modal-close").click(events.modal.close);
						// bind the continue button to invoke the callback
						$(".modal-continue").click(func);
					});
				} else {
					// no callback function
					// display modal dialog
					elements.overlay.fadeIn("fast", function () {
						// bind the close button to hide the dialog
						$(".modal-close").click(events.modal.close);
					});
				}
				// bind the escape key to allow it to close modal dialogs
				bindings.modalClose();
			},
			// fired when user clicks new game button in main nav
			start : function () {
				// get the contents of the start dialog template. it has form fields so it
				// is more complex than a standard notice/confirm dialog and has its own template
				elements.modal.html(elements.templates.start.html());
				// display modal dialog
				elements.overlay.fadeIn("fast", function () {
					// bind the close button to hide the dialog
					$(".modal-close").click(events.modal.close);
					// bind the continue button to invoke init
					$(".modal-continue").click(function () {
						events.init();
					});
				});
				// bind the escape key to allow it to close modal dialogs
				bindings.modalClose();
			}
		},
		// fired when user clicks the save game button in main nav
		save : function () {
			var store, savedData;
			// verify that a game is active. if no game is being played, there is nothing to save
			if (!utility.isGameActive()) {
				// no game is being played, display a notice via modal dialog
				events.modal.notice("Error", "You must be actively playing a game in order to <strong>save</strong>.");
			} else {
				// game is being played
				// determine if user's browser supports localstorage
				if (window.localStorage) {
					// browser supports local storage
					store = window.localStorage;
					// gather the data needed to save : stats, grid, and the table's HTML.
					savedData = {
						gamestats : data.stats,
						gamegrid : data.grid,
						gametable : elements.grid.html()
					};
					// local storage can only save strings, so Stringy the data in JSON format
					store.save = JSON.stringify(savedData);
					// display a notice saying that the game has been saved via modal dialog
					events.modal.notice("Save Successful", "Your game has successfully been saved");
				} else {
					// user's browser does not support local storage, display a notice via modal dialog
					events.modal.notice("Error", "Saving &amp; loading was implemented with localstorage. Your browser does not support this feature and is unable to load/save.");
				}
			}
		},
		// called via setInterval to keep the game's timer updated
		updateClock : function () {
			// called each second of active game play, so increment by +1 second each time
			data.stats.seconds += 1;
			// display the updated data in the stats visual area
			elements.stats.seconds.text(data.stats.seconds);
		},
		// called after each click on TD cells in the main game table
		updateStats : function () {
			// update both the clicks and minesPlanted in the stats visual area
			elements.stats.clicks.text(data.stats.clicks);
			elements.stats.mines.text(data.stats.minesPlanted);
		},
		// validate determines win/loss at end of game, either by auto validation in certain
		// situations or when the user clicks the validate button. 
		validate : function () {
			var result, numUnknownWithMine;
			// see if the game is active
			if (!utility.isGameActive()) {
				// game is not active, show an error message via modal dialog
				events.modal.notice("Error", "You must be actively playing a game in order to <strong>validate</strong>.");
			} else {
				// default to a winning message unless a loss can be proved
				result = "You Win!";
				// default the number of remaining unknown cells that have mines to 0
				numUnknownWithMine = 0;
				// since validate() is only called on a game end, flag the game as not active and clear the timer
				data.active = false;
				window.clearInterval(data.timer);
				// unbind click events on table cells
				bindings.clickCellUnbind();
				// see if any 'unknown' (e.g., unclicked, non flagged) cells have a mine
				elements.grid.find("td").each(function () {
					// cache the jQuery reference to this TD
					var $td = $(this),
						// get the row (r) and col (c) data- attributes
						r = $td.data("row"),
						c = $td.data("col"),
						// get the specific array element that has these coords
						cellToCheck = utility.getCell(r, c);
					// determine if cell is still displayed as 'unknown' but actually has a mine
					if ($td.hasClass(data.classes.unknown) && cellToCheck.mined) {
						// incremement the number of unknowns with mines. this isn't an automatic loss
						numUnknownWithMine += 1;
					}
					// determine if cell is has flag (user thinks it's mined) but actually doesn't have a mine
					if ($td.hasClass(data.classes.flagged) && !cellToCheck.mined) {
						// if user flags a cell for a mine that doesn't have one, this IS a loss since it means they missed a mine
						// somewhere else (or flagged more than there are mines somehow)
						result = "You Lose!";
					}
				});
				// cells can be left unknown if the only unknown ones are the mines (e.g., # of unknown cells remaining = numUnknownWithMine)
				// also, if there are no unknown squares (only empty & flagged) game can also be won
				// see if the numUnknownWithMine value is not zero and not = to the number of unknown squares remaining
				if (numUnknownWithMine !== 0 && numUnknownWithMine !== $("td." + data.classes.unknown).length) {
					// numUnknownWithMine doesn't match correct values, game is a loss
					result = "You Lose!";
					// iterate through each square marked as unknown and find the mines the user missed
					elements.grid.find("td." + data.classes.unknown).each(function () {
						// concatenate a string (space separated]) list of classes to add to cells
						// these classes will show the mine plus a visual to show the user missed the mine
						var classes =  data.classes.sprite + " " + data.classes.mined + " " + data.classes.miss,
							// cache the jquery reference to this TD
							$td = $(this),
							// get the row (r) and col (c) data- attributes
							r = $td.data("row"),
							c = $td.data("col"),
							// get the specific array element that has these coords
							cellToCheck = utility.getCell(r, c);
						// determine if this cell has a mine
						if (cellToCheck.mined) {
							// this cell  has a mine. remove unknown class and add appropriate classes
							$td.removeClass(data.classes.unknown).addClass(classes);
							// game is a loss
							result = "You Lose!";
						}
					});
				}
				// remove any game result that might somehow be left lingering and show the win/loss result
				$(".gameresult").remove();
				elements.stats.statistics.after("<h1 class='gameresult'>" + result + "</h1>");
			}
		}
	};

	// utility (helper) functions that calculate or create data.
	// only indirectly called via user action from above event functions
	utility = {
		// appends tbody,trs,and tds to create the game table
		buildGrid : function () {
			// for the main table, remove an existing tbody (in case of previous game), add a new one and reference it
			var $tbody = elements.grid.find("tbody").remove().end().append("<tbody>").find("tbody"),
				// get the template for the TD cells, leaving {{row}} and {{col}} to be replaced later
				template = elements.templates.td.html().replace("{{class}}", data.classes.unknown),
				$tr,
				r,
				c;
			// append tr for each row
			for (r = 0; r < data.stats.rows; r += 1) {
				$tbody.append("<tr>");
				// find the last (just appended) tr tag
				$tr = $tbody.find("tr:last");
				// append a td for each column
				for (c = 0; c < data.stats.cols; c += 1) {
					// assign the the {{row}} and {{col}} to their respective 'data-' attributes
					$tr.append(template.replace("{{row}}", r).replace("{{col}}", c));
				}
			}
		},
		// count the number of mines adjacent to the cell indicated by the coordinates passed in
		// @row : integer between 0 and data.stats.rows
		// @col : integer between 0 and data.stats.cols
		countSurroundingMines : function (row, col) {
			// default to 0 surrounding mines
			var surrounding = 0,
				cellToCheck,
				// cache the length of the directions array
				dlen = data.directions.length,
				i;
			// iterate through each direction for all adjacent cells
			for (i = 0; i < dlen; i += 1) {
				// get an adjacent cell by adding the value of the direction (-1, 0, or +1) to each coordinate
				cellToCheck = utility.getCell(row + data.directions[i].y, col + data.directions[i].x);
				// make sure it's a valid cell, e.g. that the array entry existed
				if (cellToCheck) {
					// see if the adjacent cell has a mine
					if (cellToCheck.mined) {
						// this adjacent cell has a mine, incremement the surrounding mines count
						surrounding += 1;
					}
				}
			}
			// return the number of surrounding mines
			return surrounding;
		},
		// generate the array of objects representing the cells
		generateGrid : function () {
			var randomGrid = [],
				// size of game is from a <select> element in a modal dialog. dialog is hidden,
				// not removed, so values can still be accessed
				sizeOfGame = $(".gamesize").val(),
				// number of mines is from a input type="number" element. input may not always be numeric
				numberOfMines = $(".minenumber").val(),
				r,
				c;
			// sizeOfGame is a multiplier: 1, 2, or 4 for 8/16/32 size grids
			// so we can multiply the default (8) by the multiplier to get the # of rows/cols
			data.stats.rows = data.stats.rows * sizeOfGame;
			data.stats.cols = data.stats.cols * sizeOfGame;
			// make sure the number of mines is a number before overriding the standard 10 mines
			if (!isNaN(numberOfMines)) {
				data.stats.mines = numberOfMines;
			}
			// iterate through each row
			for (r = 0; r < data.stats.rows; r += 1) {
				// create a second dimensional array for each row	
				randomGrid[r] = [];
				// iterate through each column in each row
				for (c = 0; c < data.stats.cols; c += 1) {
					// assign a default cell (with no mine) to each array entry
					randomGrid[r][c] = {mined: false};
				}
			}
			// assign this grid to the data.grid element for later use
			data.grid = randomGrid;
		},
		// returns a specific array element from data.grid
		getCell : function (r, c) {
			// make sure the row and column values (r & c) are sane
			if (r >= 0 && r < data.stats.rows && c >= 0 && c < data.stats.cols) {
				// verify that the array element exists
				if (data.grid[r][c]) {
					// return the array element
					return data.grid[r][c];
				}
			}
			// no array element was found, return null as a checksafe
			return null;
		},
		// simple function to return true/false depending if the game
		// is active/inactive (being played/not being played)
		isGameActive : function () {
			return (data.grid === null || !data.active) ? false : true;
		},
		// randomly plant the mines in a newly created grid
		plantAllMines : function () {
			var r, c;
			// data.stats.minesPlanted is the modified value, data.stats.mines will remain unchanged
			while (data.stats.minesPlanted < data.stats.mines) {
				// get a random row (r) and col (c) coordinate from 0 to max value
				r = Math.floor(Math.random() * data.stats.rows);
				c = Math.floor(Math.random() * data.stats.cols);
				// utility.plantMine() returns true if a mine was not planted (while planting the mine),
				// otherwise returns false if a mine already exists in that cell
				if (utility.plantMine(r, c)) {
					// a mine was not in this cell previously, now it is mined. incrememt minesPlanted
					data.stats.minesPlanted += 1;
				}
			}
		},
		// attempt to plant a single mine in a single cell
		// @r : random row, integer, from 0 to data.stats.rows
		// @c : random col, integer, from 0 to data.stats.cols
		plantMine : function (r, c) {
			// get the specici array element from data.grid matcing these coordinates
			var cellToPlant = data.grid[r][c];
			// verify that the array element exists
			if (cellToPlant) {
				// if this cell does not have a mine, plant one and return true
				if (!cellToPlant.mined) {
					cellToPlant.mined = true;
					return true;
				}
			}
			// either cell had a mine or (somehow) cell did not exist, return false
			return false;
		},
		// determine all continuously adjacent cells that have 0 mines
		// in adjacent cells. will recursively call itself until it finds cells that
		// have more than 0 mines adjacent
		// @r : integer, row from 0 to data.stats.rows +- 1
		// @c : integer, col from 0 to data.stats.cols +- 1
		revealEmptyAdjacent : function (r, c) {
			// since adjacent cells next to the edge can be 'off' the game board,
			// make sure cell is within range. return if not to halt recursive calls
			if (r < 0 || r >= data.stats.rows || c < 0 || c >= data.stats.cols) {
				return;
			}
			// get the specific array element for these coordinates 
			var cellToCheck = utility.getCell(r, c),
				// get the jQuery selector reference to TD element for these coordinates
				$td = elements.td(r, c),
				// count the number of mines in adjacent cells
				num = utility.countSurroundingMines(r, c),
				// cache the length of the directions array
				dlen = data.directions.length,
				i;
			// if this TD doesn't have the 'unknown' class (e.g., has not yet been revealed or flagged)
			// or if this cell has a mine or if this cell has more than 0 surrounding mines, it doesn't
			// need to be revealed, so return to halt the recursive calls
			if (!$td.hasClass(data.classes.unknown) || cellToCheck.mined || num > 0) {
				return;
			}
			// toggle classes from unknown to empty to show that it has 0 surrounding mines
			$td.removeClass(data.classes.unknown).addClass(data.classes.empty);
			// recursively call each cell adjacent to this cell
			// (which will in turn recursively call cells adjacent to all of these adjacent cells, etc)
			for (i = 0; i < dlen; i += 1) {
				utility.revealEmptyAdjacent(r + data.directions[i].y, c + data.directions[i].x);
			}
		}
	};

	// bind the buttons to allow gameplay to begin
	bindings.clickButtons();
}(jQuery));