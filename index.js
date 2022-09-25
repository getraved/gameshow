var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

const secure = false;
const url = `127.0.0.1`
const port = 3000;

let moderatorSecret = makeid(5);

var currentConnections = {};
var buzzered = {
    active: false,
    name: null
}

http.listen(port, function () {
    console.log(`///\nArcuiz started on ${url}:${port}\nJoin as moderator: ${secure ? "https://" : "http://" }${url}:${port}?secret=${moderatorSecret}\nJoin as player: ${secure ? "https://" : "http://" }${url}:${port}\n///`)
});

app.use('/static', express.static(__dirname + '/public'));

app.get('/', function (req, res) {
    res.sendFile(__dirname+'/viewer.html')
});


io.on('connection', function (socket, name) {
    currentConnections[socket.id] = {socket: socket};
    currentConnections[socket.id].data = {};

    io.emit('playerConnect', { for: 'everyone' });

    socket.on('forceDisconnect', function() {
        socket.disconnect()
    })

    socket.on('disconnect', function () {
        if (currentConnections[socket.id] === undefined) return;
        currentConnections[socket.id].data.connected = false

        // No players / moderators anymore
        if (getUsers().length === 0) {
            buzzered.active = false;
            buzzered.name = null;
            console.log("\n\nNo players // resetting game!")
            moderatorSecret = makeid(5);
            console.log("Moderator Secret: http://127.0.0.1:3000?secret="+moderatorSecret)
            currentConnections = {};
            return;
        }

        // No moderators anymore
        // if (getUsers().filter(entry => entry.role === "moderator").length === 0)

        // If buzzered and player who buzzered disconnects
        if (buzzered.active && buzzered.name !== null) {
            if (getUsers().filter(entry => entry.name === buzzered.name).length === 0) {
                buzzered.active = false;
                buzzered.name = null;
            }
        }

        io.emit('playerDisconnect', getUsers(false, true), { for: 'everyone' });

        if (buzzered.active && buzzered.name !== null) {
            // Make sure it's called AFTER update players list
            io.emit('setActiveBuzzer', buzzered.name, getUsers(true))
        }
    })

    socket.on('playerJoin', function (username, secret) {
        let role = "player";
        if (secret && secret === moderatorSecret) {
            // Delete Token after redemption
            /*moderatorSecret = makeid(5);
            console.log("Moderator Secret Redeemed! New one: http://127.0.0.1:3000?secret="+moderatorSecret)*/
            role = "moderator";
        }
        // if (getUsers(true).length == 0) role = "moderator";

        if (username.length == 0) {
            return socket.emit('error', "Please enter a username", {for: 'everyone'})
        }

        if (getUsers(true).filter(entry => entry.name === username).length === 1 && getUsers(true).filter(entry => entry.name === username && entry.connected === true).length === 1) {
            return socket.emit('error', "Username already taken!", {for: 'everyone'})
        }

        if (getUsers(true).filter(entry => entry.name === username && entry.connected === false).length === 1) {
            // User reconnected

            let old = Object.values(currentConnections).filter(entry => entry.data.name === username && entry.data.connected === false)[0];

            const clone = JSON.parse(JSON.stringify(old.data))

            currentConnections[socket.id].data = clone;
            currentConnections[socket.id].data.connected = true

            old.data = []
            delete Object.values(currentConnections).filter(entry => entry.data.name === username && entry.data.connected === false)

        } else {
            // New user
            currentConnections[socket.id].data = {
                name: username,
                role: role,
                points: 0,
                connected: true
            }
        }

        io.emit('playerJoin', getUsers(false, true));

        if (buzzered.active && buzzered.name !== null) {
            // Make sure it's called AFTER update players list
            io.emit('setActiveBuzzer', buzzered.name, getUsers())
        }
    })

    socket.on('buzzered', function (username) {
        if (buzzered.active) return;
        buzzered.active = true;
        buzzered.name = username;

        io.emit('buzzered', getUserByUsername(username), getUsers(), {for: 'everyone'});
    })

    socket.on('wrong', function (buzzered__name) {
        buzzered.active = false;
        buzzered.name = null;

        let users = getUsers();
        users = users.filter(entry => entry.name !== buzzered__name && entry.role !== "moderator")

        for (const user of users)
            user.points += 1;

        io.emit('wrongAnswered', getUsers(false ,true), buzzered__name)
    })

    socket.on('correct', function (buzzered__name) {
        buzzered.active = false;
        buzzered.name = null;

        const user = getUserByUsername(buzzered__name)
        if (user === undefined) return;
        if (user)
            user.points += 3;

        io.emit('correctAnswered', getUsers(false, true), buzzered__name)
    })

    socket.on('nopoints', function (username) {
        buzzered.active = false;
        buzzered.name = null;
        io.emit('nopointsAnswered', getUsers(false, true), username)
    })

    socket.on('updatepoints', function (username, points) {
        const user = getUserByUsername(username)
        if (user === undefined) return;

        user.points = points;
        io.emit('nopointsAnswered', getUsers(false, true), username)
    })

    function getUsers(disconnected, sorted) {
        let users = Object.values(currentConnections).map(entry => entry.data);
        users = users.filter(value => Object.keys(value).length !== 0);
        if (!disconnected) users = users.filter(entry => entry.connected) // only return connected clients!
        if (sorted) {
            const usersWithoutModerators = users.filter(entry => entry.role !== "moderator");
            const usersOnlyModerators = users.filter(entry => entry.role === "moderator");
            users = (usersOnlyModerators.sort( function( a, b ) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0 })).concat((usersWithoutModerators.sort( function( a, b ) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0 })));
        }
        return users
    }

    function getUserByUsername(username) {
        const users = getUsers(true);
        return users.filter(user => user.name === username)[0]
    }
});

function makeid(length) {
    var result           = '';
    var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for ( var i = 0; i < length; i++ ) {
        result += characters.charAt(Math.floor(Math.random() *
            charactersLength));
    }
    return result;
}
