const choo = require('choo');
const html = require('choo/html');
const util = require('./util');
const app = choo();

var localStorage = window.localStorage;
var socket;
var unread = 0;
var isBlurred = false;

app.model({
    state: {
        now: new Date(),
        users: [],
        messages: [],
        nick: localStorage.nick ? localStorage.nick : '',
        loggedIn: false,
        connected: false,
        showOptions: false,
        notify: localStorage.notify === 'true',
        dark: localStorage.dark === 'true',
        boss: localStorage.boss === 'true'
    },
    reducers: {
        setNick: (state, nick) => {
            localStorage.nick = nick;
            return {nick: nick};
        },
        setUsers: (state, users) => ({users: users}),
        addUser: (state, user) => ({users: [...state.users, user]}),
        deleteUser: (state, user) => ({users: state.users.filter(u => u.id !== user.id)}),
        setLoggedIn: (state, loggedIn) => ({loggedIn: loggedIn}),
        setConnected: (state, connected) => ({connected: connected}),
        setShowOptions: (state, showOptions) => ({showOptions: showOptions}),
        setNotify: (state, notify) => {
            if (notify) { Notification.requestPermission(); }
            localStorage.notify = notify;
            return {notify: notify};
        },
        setDark: (state, dark) => {
            localStorage.dark = dark;
            return {dark: dark};
        },
        setBoss: (state, boss) => {
            localStorage.boss = boss;
            return {boss: boss};
        },
        receiveMessage: (state, message) => {
            if (state.messages.some(m => m.time.getTime() === message.time.getTime()))
                return state;
            if (isBlurred) {
                unread++;
                document.title = `(${unread}) nekocafe`;
                if (state.notify) {
                    var n = new Notification('nekocafe', {tag: 'nekocafe', body: `<${message.nick}> ${message.message}`});
                }
            }
            return {messages: [...state.messages, message]};
        },
        setTime: (state, time) => ({now: time})
    },
    effects: {
        sendMessage: (state, data, send, done) => {
            socket.emit('message', data);
        },
        login: (state, data, send, done) => {
            send('setLoggedIn', true, done);
            socket = io();
            socket.on('connect', () => {
                socket.emit('nick', {nick: state.nick});
                send('setConnected', true, done);
            });
            socket.on('disconnect', () => {
                send('setConnected', false, done);
            });
            socket.on('message', (msg) => send(
                'receiveMessage',
                {
                    time: new Date(msg.time),
                    nick: msg.nick,
                    message: msg.message,
                    embeds: msg.embeds
                },
                done));
            socket.on('users', (users) => send('setUsers', users, done));
            socket.on('join', (user) => send('addUser', user, done));
            socket.on('part', (user) => send('deleteUser', user, done));
            socket.on('time', (time) => send('setTime', new Date(time), done));
        }
    },
    subscriptions: {
        blur: (send, done) => {
            window.addEventListener('blur', () => {
                unread = 0;
                isBlurred = true;
            }, false);
            window.addEventListener('focus', () => {
                document.title = 'nekocafe';
                isBlurred = false;
            }, false);
        }
    }
});

function scrollDown() {
    var body = document.body;
    var html = document.getElementsByTagName('html')[0];
    // other browsers
    body.scrollTop = body.scrollHeight;
    // firefox
    html.scrollTop = html.scrollHeight;
}

const messageTime = (now, time) => html`
    <span class="col-xs-2 col-sm-1 time">${util.relTime(now, time)}</span>
`;

const messageText = (message) => {
    const msgSpan = html`<span></span>`;
    msgSpan.innerHTML = util.hotLink(util.escapeHtml(message.message));
    return html`
        <span class="col-xs-10 col-sm-11 text">${'<' + message.nick + '>'} ${msgSpan}</span>
    `;
};

const embedRow = (embed) => {
    const inner = html`<div></div>`;
    switch (embed.type) {
        case 'html':
            inner.innerHTML = embed.html;
            break;
        case 'tweet':
            twttr.widgets.createTweet(embed.id, inner);
            break;
        default:
            inner.innerHTML = '[error loading embed]';
            break;
    }
    const elt = html`
        <div class="row">
            <div class="col-xs-12 col-md-8">
                ${inner}
            </div>
        </div>
    `;
    elt.isSameNode = () => true;
    return elt;
};

const messageItem = (state, message, installOnload) => {
    const embeds = state.boss ? [] : message.embeds;
    if (installOnload)
        return html`
            <li onload=${scrollDown}>
                <div class="row message">
                    ${messageTime(state.now, message.time)}
                    ${messageText(message)}
                </div>
                ${embeds.map(embedRow)}
            </li>
        `;
    else
        return html`
            <li>
                <div class="row message">
                    ${messageTime(state.now, message.time)}
                    ${messageText(message)}
                </div>
                ${embeds.map(embedRow)}
            </li>
        `;
}

const messageList  = (state) => {
    const messages = state.messages;
    return html`
        <ul class="messageList">
            ${messages.map((message, i) => messageItem(state, message, i+1 === messages.length))}
        </ul>
    `;
};

const spinner = (state) => {
    return html`<p class="navbar-text">Connecting...</div>`;
};

const loginWidget = (nick, oninput, login) => {
    return html`
        <form class="navbar-form login" onsubmit=${login}>
            <div class="form-group">
                <input class="form-control" type="text" name="nick" placeholder="Name"
                    oninput=${oninput} value=${nick} autofocus required />
            </div>
            <button class="btn btn-primary" type="submit">Connect</button>
        </form>
    `;
}

const statusBar = (state, send) => {
    function login(e) {
        e.preventDefault();
        send('login');
    }

    function oninput(e) {
        send('setNick', e.target.value);
    }

    var status = html`<p class="navbar-text" href="">${state.users.map(u => u.nick).join(', ')}</a>`;

    return html`
        <nav class="navbar ${state.dark ? 'navbar-inverse' : 'navbar-default'} navbar-fixed-top">
            <div class="container">
                <div class="row">
                    <span class="col-xs-9 col-sm-10">
                        ${!state.loggedIn ? loginWidget(state.nick, oninput, login) :
                            (state.connected ? status : spinner(state))}
                    </span>
                    <span class="col-xs-3 col-sm-2">
                        <button class="btn btn-default navbar-btn navbar-right" type="button"
                            tabindex="-1" onclick=${() => send('setShowOptions', !state.showOptions)}>${state.showOptions? '😺' : '🐱'}</button>
                    </span>
                </div>
            </div>
        </nav>
    `;
};

const optionsWidget = (state, send) => {
    return html`
        <form class="options" onload=${scrollDown}>
            <label>Online</label>
                <p>${state.users.map(u => u.nick).join(', ')}</p>
            <label>Options</label>
            <div class="checkbox">
                <label>
                    <input type="checkbox" ${state.notify ? 'checked': ''}
                        onchange=${e => send('setNotify', e.target.checked)} />
                    Notifications
                </label>
            </div>
            <div class="checkbox">
                <label>
                    <input type="checkbox" ${state.dark ? 'checked' : ''}
                        onchange=${e => send('setDark', e.target.checked)} />
                    Dark mode
                </label>
            </div>
            <div class="checkbox">
                <label>
                    <input type="checkbox" ${state.boss ? 'checked' : ''}
                        onchange=${e => send('setBoss', e.target.checked)} />
                    Boss mode
                </label>
            </div>
        </form>
    `;
};

function disableIf(exp) {
    return exp ? 'disabled' : '';
}

const messageBar = (state, send) => {
    function onSubmit(e) {
        e.preventDefault();
        send('sendMessage', e.target.children[0].children[0].value);
        e.target.reset();
    }
    return html`
        <nav class="navbar ${state.dark ? 'navbar-inverse' : 'navbar-default'} navbar-fixed-bottom">
            <div class="container">
                <form class="navbar-form messageWidget" onsubmit=${onSubmit}>
                    <div class="input-group">
                        <input ${disableIf(!state.connected)} id="message" name="message"
                            class="form-control" placeholder="Enter message" autocomplete="off" />
                        <span class="input-group-btn">
                            <button ${disableIf(!state.connected)} class="btn btn-default" type="submit">Send</button>
                        </span>
                    </div>
                </form>
            </div>
        </nav>
    `;
}

const mainView = (state, prev, send) => html`
    <div class="${state.dark ? 'dark' : ''}">
        ${statusBar(state, send)}
        <div class="container content">
            ${messageList(state)}
            ${state.showOptions ? optionsWidget(state, send) : ''}
        </div>
        ${messageBar(state, send)}
    </div>
`;

app.router(['/', mainView]);

//const tree = app.start('#root');
const tree = app.start();
document.body.appendChild(tree);