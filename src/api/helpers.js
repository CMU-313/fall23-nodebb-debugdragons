'use strict';

const user = require('../user');
const topics = require('../topics');
const posts = require('../posts');
const privileges = require('../privileges');
const plugins = require('../plugins');
const socketHelpers = require('../socket.io/helpers');
const websockets = require('../socket.io');
const events = require('../events');

exports.setDefaultPostData = function (reqOrSocket, data) {
    data.uid = reqOrSocket.uid;
    data.req = exports.buildReqObject(reqOrSocket, { ...data });
    data.timestamp = Date.now();
    data.fromQueue = false;
};

// creates a slimmed down version of the request object
exports.buildReqObject = (payload, req = {}) => {
    // Destructure properties from req with default values where applicable
    const {
        headers = {},
        connection,
        method,
        body,
        session,
        ip,
        uid,
        params,
    } = req;

    // Destructure encrypted flag from the connection
    const encrypted = connection ? !!connection.encrypted : false;

    // Destructure host and referer from headers with a default empty string for referer
    const { host: headersHost = '', referer = '' } = headers;

    let host = headersHost;
    let refererURL;

    try {
        refererURL = new URL(referer);
    } catch (error) {
    // Handle cases where referer is not a valid URL
        refererURL = new URL('http://127.0.0.1:4567');
    }

    // Use the host from refererURL if headersHost is not available
    if (!host) {
        host = refererURL.host;
    }

    const path = refererURL.pathname + refererURL.search + refererURL.hash;

    return {
        uid,
        params,
        method,
        body: payload || body,
        session,
        ip,
        host,
        protocol: encrypted ? 'https' : 'http',
        secure: encrypted,
        url: referer,
        path,
        headers,
    };
};

exports.doTopicAction = async function (action, event, caller, { tids }) {
    if (!Array.isArray(tids)) {
        throw new Error('[[error:invalid-tid]]');
    }

    const exists = await topics.exists(tids);
    if (!exists.every(Boolean)) {
        throw new Error('[[error:no-topic]]');
    }

    if (typeof topics.tools[action] !== 'function') {
        return;
    }

    const uids = await user.getUidsFromSet('users:online', 0, -1);

    await Promise.all(tids.map(async (tid) => {
        const title = await topics.getTopicField(tid, 'title');
        const data = await topics.tools[action](tid, caller.uid);
        const notifyUids = await privileges.categories.filterUids('topics:read', data.cid, uids);
        socketHelpers.emitToUids(event, data, notifyUids);
        await logTopicAction(action, caller, tid, title);
    }));
};

async function logTopicAction(action, req, tid, title) {
    // Only log certain actions to system event log
    const actionsToLog = ['delete', 'restore', 'purge'];
    if (!actionsToLog.includes(action)) {
        return;
    }
    await events.log({
        type: `topic-${action}`,
        uid: req.uid,
        ip: req.ip,
        tid,
        title: String(title),
    });
}

exports.postCommand = async function (caller, command, eventName, notification, data) {
    if (!caller.uid) {
        throw new Error('[[error:not-logged-in]]');
    }

    if (!data || !data.pid) {
        throw new Error('[[error:invalid-data]]');
    }

    if (!data.room_id) {
        throw new Error(`[[error:invalid-room-id, ${data.room_id} ]]`);
    }
    const [exists, deleted] = await Promise.all([
        posts.exists(data.pid),
        posts.getPostField(data.pid, 'deleted'),
    ]);

    if (!exists) {
        throw new Error('[[error:invalid-pid]]');
    }

    if (deleted) {
        throw new Error('[[error:post-deleted]]');
    }

    /*
    hooks:
        filter:post.upvote
        filter:post.downvote
        filter:post.unvote
        filter:post.bookmark
        filter:post.unbookmark
     */
    const filteredData = await plugins.hooks.fire(`filter:post.${command}`, {
        data,
        uid: caller.uid,
    });
    return await executeCommand(caller, command, eventName, notification, filteredData.data);
};

async function executeCommand(caller, command, eventName, notification, data) {
    const result = await posts[command](data.pid, caller.uid);
    if (result && eventName) {
        websockets.in(`uid_${caller.uid}`).emit(`posts.${command}`, result);
        websockets.in(data.room_id).emit(`event:${eventName}`, result);
    }
    if (result && command === 'upvote') {
        socketHelpers.upvote(result, notification);
    } else if (result && notification) {
        socketHelpers.sendNotificationToPostOwner(data.pid, caller.uid, command, notification);
    } else if (result && command === 'unvote') {
        socketHelpers.rescindUpvoteNotification(data.pid, caller.uid);
    }
    return result;
}
