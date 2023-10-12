
'use strict';

const _ = require('lodash');
const validator = require('validator');
const nconf = require('nconf');
const assert = require('assert');

const db = require('../database');
const user = require('../user');
const posts = require('../posts');
const meta = require('../meta');
const plugins = require('../plugins');
const utils = require('../utils');

const backlinkRegex = new RegExp(`(?:${nconf.get('url').replace('/', '\\/')}|\b|\\s)\\/topic\\/(\\d+)(?:\\/\\w+)?`, 'g');

module.exports = function (Topics) {
    // Adding post to topic
    /**
     * @param {Promise<object>} postData
     * @returns {Promise<void>}
    */
    Topics.onNewPostMade = async function (postData) {
        // Assert function parameter types in the body
        assert(typeof postData === 'object' && postData !== null, 'postData must be an object');
        await Topics.updateLastPostTime(postData.tid, postData.timestamp);
        await Topics.addPostToTopic(postData.tid, postData);
    };

    // Gets the topic of post
    /**
     * @param {Promise<object>} topicData
     * @param {Promise<string>} set
     * @param {Promise<number>} start
     * @param {Promise<number>} stop
     * @param {Promise<number>} uid
     * @param {Promise<boolean>} reverse
     * @returns {Promise<object[]>}
     */
    Topics.getTopicPosts = async function (topicData, set, start, stop, uid, reverse) {
        // Assert function parameter types in the body
        assert(typeof set === 'string', 'set must be a string');
        assert(typeof start === 'number' && typeof stop === 'number', 'start and stop must be numbers');
        assert(typeof uid === 'number', 'uid must be a number');
        assert(typeof reverse === 'boolean', 'reverse must be a boolean');
        if (!topicData) {
            return [];
        }

        let repliesStart = start;
        let repliesStop = stop;
        if (stop > 0) {
            repliesStop -= 1;
            if (start > 0) {
                repliesStart -= 1;
            }
        }
        let pids = [];
        if (start !== 0 || stop !== 0) {
            pids = await posts.getPidsFromSet(set, repliesStart, repliesStop, reverse);
        }
        if (!pids.length && !topicData.mainPid) {
            return [];
        }

        if (topicData.mainPid && start === 0) {
            pids.unshift(topicData.mainPid);
        }
        let postData = await posts.getPostsByPids(pids, uid);
        if (!postData.length) {
            return [];
        }
        let replies = postData;
        if (topicData.mainPid && start === 0) {
            postData[0].index = 0;
            replies = postData.slice(1);
        }

        Topics.calculatePostIndices(replies, repliesStart);
        await addEventStartEnd(postData, set, reverse, topicData);
        const allPosts = postData.slice();
        postData = await user.blocks.filter(uid, postData);
        if (allPosts.length !== postData.length) {
            const includedPids = new Set(postData.map(p => p.pid));
            allPosts.reverse().forEach((p, index) => {
                if (!includedPids.has(p.pid) && allPosts[index + 1] && !reverse) {
                    allPosts[index + 1].eventEnd = p.eventEnd;
                }
            });
        }

        const result = await plugins.hooks.fire('filter:topic.getPosts', {
            topic: topicData,
            uid: uid,
            posts: await Topics.addPostData(postData, uid),
        });
        const postsResult = result.posts;
        // Assert function return types in the body
        assert(Array.isArray(postsResult), 'Expected result to be an array');
        return postsResult;
    };

    // Adds start and end of event
    /**
     * @param {Promise<object[]>} postData
     * @param {Promise<string>} set
     * @param {Promise<boolean>} reverse
     * @param {Promise<object>} topicData
     * @returns {Promise<void>}
     */
    async function addEventStartEnd(postData, set, reverse, topicData) {
        // Assert function parameter types in the body
        assert(Array.isArray(postData), 'postData must be an array');
        assert(typeof set === 'string', 'set must be a string');
        assert(typeof reverse === 'boolean', 'reverse must be a boolean');
        assert(typeof topicData === 'object' && topicData !== null, 'topicData must be an object');
        if (!postData.length) {
            return;
        }
        postData.forEach((p, index) => {
            if (p && p.index === 0 && reverse) {
                p.eventStart = topicData.lastposttime;
                p.eventEnd = Date.now();
            } else if (p && postData[index + 1]) {
                p.eventStart = reverse ? postData[index + 1].timestamp : p.timestamp;
                p.eventEnd = reverse ? p.timestamp : postData[index + 1].timestamp;
            }
        });
        const lastPost = postData[postData.length - 1];
        if (lastPost) {
            lastPost.eventStart = reverse ? topicData.timestamp : lastPost.timestamp;
            lastPost.eventEnd = reverse ? lastPost.timestamp : Date.now();
            if (lastPost.index) {
                const nextPost = await db[reverse ? 'getSortedSetRevRangeWithScores' : 'getSortedSetRangeWithScores'](set, lastPost.index, lastPost.index);
                if (reverse) {
                    lastPost.eventStart = nextPost.length ? nextPost[0].score : lastPost.eventStart;
                } else {
                    lastPost.eventEnd = nextPost.length ? nextPost[0].score : lastPost.eventEnd;
                }
            }
        }
    }

    // Adds data to post
    /**
     * @param {Promise<object[]>} postData
     * @param {Promise<number>} uid
     * @returns {Promise<object[]>}
     */
    Topics.addPostData = async function (postData, uid) {
        // Assert function parameter types in the body
        assert(typeof uid === 'number' || typeof uid === 'string', 'uid must be a number or string');
        if (!Array.isArray(postData) || !postData.length) {
            return [];
        }
        const pids = postData.map(post => post && post.pid);

        async function getPostUserData(field, method) {
            const uids = _.uniq(postData.filter(p => p && parseInt(p[field], 10) >= 0).map(p => p[field]));
            const userData = await method(uids);
            return _.zipObject(uids, userData);
        }
        const [
            bookmarks,
            voteData,
            userData,
            editors,
            replies,
        ] = await Promise.all([
            posts.hasBookmarked(pids, uid),
            posts.getVoteStatusByPostIDs(pids, uid),
            getPostUserData('uid', async uids => await posts.getUserInfoForPosts(uids, uid)),
            getPostUserData('editor', async uids => await user.getUsersFields(uids, ['uid', 'username', 'userslug'])),
            getPostReplies(pids, uid),
            Topics.addParentPosts(postData),
        ]);

        postData.forEach((postObj, i) => {
            if (postObj) {
                postObj.user = postObj.uid ? userData[postObj.uid] : { ...userData[postObj.uid] };
                postObj.editor = postObj.editor ? editors[postObj.editor] : null;
                postObj.bookmarked = bookmarks[i];
                postObj.upvoted = voteData.upvotes[i];
                postObj.downvoted = voteData.downvotes[i];
                postObj.votes = postObj.votes || 0;
                postObj.replies = replies[i];
                postObj.selfPost = parseInt(uid, 10) > 0 && parseInt(uid, 10) === postObj.uid;

                // Username override for guests, if enabled
                if (meta.config.allowGuestHandles && postObj.uid === 0 && postObj.handle) {
                    postObj.user.username = validator.escape(String(postObj.handle));
                    postObj.user.displayname = postObj.user.username;
                }
            }
        });

        const result = await plugins.hooks.fire('filter:topics.addPostData', {
            posts: postData,
            uid: uid,
        });
        const postResult = result.posts;
        // Assert function return types in the body
        assert(Array.isArray(postResult), 'Expected result to be an array');
        return postResult;
    };

    // Modifies posts by privileges
    /**
     * @param {Promise<object>} topicData
     * @param {Promise<object>} topicPrivileges
     * @returns {Promise<void>}
    */
    Topics.modifyPostsByPrivilege = function (topicData, topicPrivileges) {
        // Assert function parameter types in the body
        assert(typeof topicData === 'object', 'topicData must be an object');
        assert(typeof topicPrivileges === 'object', 'topicPrivileges must be a object');
        const loggedIn = parseInt(topicPrivileges.uid, 10) > 0;
        topicData.posts.forEach((post) => {
            if (post) {
                post.topicOwnerPost = parseInt(topicData.uid, 10) === parseInt(post.uid, 10);
                post.display_edit_tools = topicPrivileges.isAdminOrMod || (post.selfPost && topicPrivileges['posts:edit']);
                post.display_delete_tools = topicPrivileges.isAdminOrMod || (post.selfPost && topicPrivileges['posts:delete']);
                post.display_moderator_tools = post.display_edit_tools || post.display_delete_tools;
                post.display_move_tools = topicPrivileges.isAdminOrMod && post.index !== 0;
                post.display_post_menu = topicPrivileges.isAdminOrMod ||
                    (post.selfPost &&
                        ((!topicData.locked && !post.deleted) ||
                        (post.deleted && parseInt(post.deleterUid, 10) === parseInt(topicPrivileges.uid, 10)))) ||
                    ((loggedIn || topicData.postSharing.length) && !post.deleted);
                post.ip = topicPrivileges.isAdminOrMod ? post.ip : undefined;

                posts.modifyPostByPrivilege(post, topicPrivileges);
            }
        });
    };

    // Adding parent posts
    /**
     * @param {Promise<object[]>} postData
     * @returns {Promise<void>}
    */
    Topics.addParentPosts = async function (postData) {
        // Assert function parameter types in the body
        assert(Array.isArray(postData), 'postData must be an array');
        let parentPids = postData.map(postObj => (postObj && postObj.hasOwnProperty('toPid') ? parseInt(postObj.toPid, 10) : null)).filter(Boolean);

        if (!parentPids.length) {
            return;
        }
        parentPids = _.uniq(parentPids);
        const parentPosts = await posts.getPostsFields(parentPids, ['uid']);
        const parentUids = _.uniq(parentPosts.map(postObj => postObj && postObj.uid));
        const userData = await user.getUsersFields(parentUids, ['username']);

        const usersMap = {};
        userData.forEach((user) => {
            usersMap[user.uid] = user.username;
        });
        const parents = {};
        parentPosts.forEach((post, i) => {
            parents[parentPids[i]] = { username: usersMap[post.uid] };
        });

        postData.forEach((post) => {
            post.parent = parents[post.toPid];
        });
    };

    // Calculates post indicies
    /**
     * @param {Promise<object>} posts
     * @param {Promise<number>} start
     * @returns {Promise<void>}
    */
    Topics.calculatePostIndices = function (posts, start) {
        // Assert function parameter types in the body
        assert(typeof posts === 'object', 'posts must be an object');
        assert(typeof start === 'number', 'start must be a number');
        posts.forEach((post, index) => {
            if (post) {
                post.index = start + index + 1;
            }
        });
    };

    // Gets the latest non-deleted post id
    /**
     * @param {Promise<string> || Promise<number>} tid
     * @returns {Promise<number> || Promise<object>}
    */
    Topics.getLatestUndeletedPid = async function (tid) {
        // Assert function parameter types in the body
        assert(typeof tid === 'number' || typeof tid === 'string', 'tid must be a number or string');
        const pid = await Topics.getLatestUndeletedReply(tid);
        if (pid) {
            return pid;
        }
        const mainPid = await Topics.getTopicField(tid, 'mainPid');
        const mainPost = await posts.getPostFields(mainPid, ['pid', 'deleted']);
        const result = mainPost.pid && !mainPost.deleted ? mainPost.pid : null;
        // Assert function return types in the body
        assert(typeof result === 'number' || typeof result === 'object', 'result must be a number or object');
        return result;
    };

    // Gets the latest non-deleted reply
    /**
     * @param {Promise<string> || Promise<number>} tid
     * @returns {Promise<number> || Promise<null>}
    */
    Topics.getLatestUndeletedReply = async function (tid) {
        // Assert function parameter types in the body
        assert(typeof tid === 'number' || typeof tid === 'string', 'tid must be a number or string');
        let isDeleted = false;
        let index = 0;
        do {
            /* eslint-disable no-await-in-loop */
            const pids = await db.getSortedSetRevRange(`tid:${tid}:posts`, index, index);
            if (!pids.length) {
                return null;
            }
            isDeleted = await posts.getPostField(pids[0], 'deleted');
            if (!isDeleted) {
                return parseInt(pids[0], 10);
            }
            index += 1;
        } while (isDeleted);
    };

    // Adds post to topic
    /**
     * @param {Promise<string> || Promise<number>} tid
     * @param {Promise<object>} postData
     * @returns {Promise<void>}
    */
    Topics.addPostToTopic = async function (tid, postData) {
        // Assert function parameter types in the body
        assert(typeof tid === 'number' || typeof tid === 'string', 'tid must be a number or string');
        assert(typeof postData === 'object', 'postData must be an object');
        const mainPid = await Topics.getTopicField(tid, 'mainPid');
        if (!parseInt(mainPid, 10)) {
            await Topics.setTopicField(tid, 'mainPid', postData.pid);
        } else {
            const upvotes = parseInt(postData.upvotes, 10) || 0;
            const downvotes = parseInt(postData.downvotes, 10) || 0;
            const votes = upvotes - downvotes;
            await db.sortedSetsAdd([
                `tid:${tid}:posts`, `tid:${tid}:posts:votes`,
            ], [postData.timestamp, votes], postData.pid);
        }
        await Topics.increasePostCount(tid);
        if (await user.isInstructor(postData.uid)) {
            await Topics.increaseInstructorCount(tid);
        }
        await db.sortedSetIncrBy(`tid:${tid}:posters`, 1, postData.uid);
        const posterCount = await db.sortedSetCard(`tid:${tid}:posters`);
        await Topics.setTopicField(tid, 'postercount', posterCount);
        await Topics.updateTeaser(tid);
    };

    // Removes post to topic
    /**
     * @param {Promise<string> || Promise<number>} tid
     * @param {Promise<object>} postData
     * @returns {Promise<void>}
    */
    Topics.removePostFromTopic = async function (tid, postData) {
        // Assert function parameter types in the body
        assert(typeof tid === 'number' || typeof tid === 'string', 'tid must be a number or string');
        assert(typeof postData === 'object', 'postData must be an object');
        await db.sortedSetsRemove([
            `tid:${tid}:posts`,
            `tid:${tid}:posts:votes`,
        ], postData.pid);
        await Topics.decreasePostCount(tid);
        if (user.isInstructor(postData.uid)) {
            await Topics.decreaseInstructorCount(tid);
        }
        await db.sortedSetIncrBy(`tid:${tid}:posters`, -1, postData.uid);
        await db.sortedSetsRemoveRangeByScore([`tid:${tid}:posters`], '-inf', 0);
        const posterCount = await db.sortedSetCard(`tid:${tid}:posters`);
        await Topics.setTopicField(tid, 'postercount', posterCount);
        await Topics.updateTeaser(tid);
    };

    // Removes post to topic
    /**
     * @param {Promise<string> || Promise<number>} tid
     * @returns {Promise<object>}
    */
    Topics.getPids = async function (tid) {
        // Assert function parameter types in the body
        assert(typeof tid === 'number' || typeof tid === 'string', 'tid must be a number or string');
        let [mainPid, pids] = await Promise.all([
            Topics.getTopicField(tid, 'mainPid'),
            db.getSortedSetRange(`tid:${tid}:posts`, 0, -1),
        ]);
        if (parseInt(mainPid, 10)) {
            pids = [mainPid].concat(pids);
        }
        const result = pids;
        // Assert function return types in the body
        assert(typeof result === 'object', 'result must be an object');
        return pids;
    };

    // Increases the post count
    /**
     * @param {Promise<string> || Promise<number>} tid
     * @returns {Promise<void>}
    */
    Topics.increasePostCount = async function (tid) {
        // Assert function parameter types in the body
        assert(typeof tid === 'number' || typeof tid === 'string', 'tid must be a number or string');
        incrementFieldAndUpdateSortedSet(tid, 'postcount', 1, 'topics:posts');
    };

    // Decreases the post count
    /**
     * @param {Promise<string> || Promise<number>} tid
     * @returns {Promise<void>}
    */
    Topics.decreasePostCount = async function (tid) {
        // Assert function parameter types in the body
        assert(typeof tid === 'number' || typeof tid === 'string', 'tid must be a number or string');
        incrementFieldAndUpdateSortedSet(tid, 'postcount', -1, 'topics:posts');
    };

    // Increases the view count for the post
    /**
     * @param {Promise<string> || Promise<number>} tid
     * @returns {Promise<void>}
    */
    Topics.increaseViewCount = async function (tid) {
        // Assert function parameter types in the body
        assert(typeof tid === 'number' || typeof tid === 'string', 'tid must be a number or string');
        const cid = await Topics.getTopicField(tid, 'cid');
        incrementFieldAndUpdateSortedSet(tid, 'viewcount', 1, ['topics:views', `cid:${cid}:tids:views`]);
    };

    // Increases the instructor count
    /**
     * @param {Promise<string> || Promise<number>} tid
     * @returns {Promise<void>}
    */
    Topics.increaseInstructorCount = async function (tid) {
        // Assert function parameter types in the body
        assert(typeof tid === 'number' || typeof tid === 'string', 'tid must be a number or string');
        await db.incrObjectFieldBy(`topic:${tid}`, 'instructorcount', 1);
    };

    // Decreases the instructor count
    /**
     * @param {Promise<string> || Promise<number>} tid
     * @returns {Promise<void>}
    */
    Topics.decreaseInstructorCount = async function (tid) {
        // Assert function parameter types in the body
        assert(typeof tid === 'number' || typeof tid === 'string', 'tid must be a number or string');
        await db.incrObjectFieldBy(`topic:${tid}`, 'instructorcount', -1);
    };

    // Increments field and updates sorted set
    /**
     * @param {Promise<string> || Promise<number>} tid
     * @param {Promise<string>} field
     * @param {Promise<number>} by
     * @param {Promise<string>} set
    * @returns {Promise<void>}
    */
    async function incrementFieldAndUpdateSortedSet(tid, field, by, set) {
        // Assert function parameter types in the body
        assert(typeof tid === 'number' || typeof tid === 'string', 'tid must be a number or string');
        assert(typeof field === 'string', 'field must be a string');
        assert(typeof by === 'number', 'by must be a number');
        assert(typeof set === 'string', 'set must be a string');
        const value = await db.incrObjectFieldBy(`topic:${tid}`, field, by);
        await db[Array.isArray(set) ? 'sortedSetsAdd' : 'sortedSetAdd'](set, value, tid);
    }

    // Gets the title of post by id
    /**
     * @param {Promise<string> || Promise<number>} pid
     * @returns {Promise<string>}
    */
    Topics.getTitleByPid = async function (pid) {
        // Assert function parameter types in the body
        assert(typeof pid === 'number' || typeof pid === 'string', 'pid must be a number or string');
        const result = await Topics.getTopicFieldByPid('title', pid);
        // Assert function return types in the body
        assert(typeof result === 'string', 'result must be a string');
        return result;
    };

    // Gets the topic field by post id
    /**
     * @param {Promise<string> || Promise<number>} pid
     * @param {Promise<string>} field
     * @returns {Promise<string>}
    */
    Topics.getTopicFieldByPid = async function (field, pid) {
        // Assert function parameter types in the body
        assert(typeof field === 'string', 'field must be a string');
        assert(typeof pid === 'number' || typeof pid === 'string', 'pid must be a number or string');
        const tid = await posts.getPostField(pid, 'tid');
        const result = await Topics.getTopicField(tid, field);
        // Assert function return types in the body
        assert(typeof result === 'string', 'result must be a string');
        return result;
    };

    // Gets the topic data by post id
    /**
     * @param {Promise<string> || Promise<number>} pid
     * @returns {Promise<object>}
    */
    Topics.getTopicDataByPid = async function (pid) {
        // Assert function parameter types in the body
        assert(typeof pid === 'number' || typeof pid === 'string', 'pid must be a number or string');
        const tid = await posts.getPostField(pid, 'tid');
        const result = await Topics.getTopicData(tid);
        // Assert function return types in the body
        assert(typeof result === 'object', 'result must be a object');
        return result;
    };

    // Gets the post count
    /**
     * @param {Promise<string> || Promise<number>} tid
     * @returns {Promise<string>}
    */
    Topics.getPostCount = async function (tid) {
        // Assert function parameter types in the body
        assert(typeof tid === 'number' || typeof tid === 'string', 'tid must be a number or string');
        const result = await db.getObjectField(`topic:${tid}`, 'postcount');
        return result;
    };

    // Gets post replies
    /**
     * @param {Promise<object>} pids
     * @param {Promise<number || Promise<string>} callerUid
     * @returns {Promise<object>}
    */
    async function getPostReplies(pids, callerUid) {
        // Assert function parameter types in the body
        assert(typeof pids === 'object', 'pids must be a object');
        assert(typeof callerUid === 'number' || typeof callerUid === 'string', 'callerUid must be a number or string');
        const keys = pids.map(pid => `pid:${pid}:replies`);
        const arrayOfReplyPids = await db.getSortedSetsMembers(keys);

        const uniquePids = _.uniq(_.flatten(arrayOfReplyPids));

        let replyData = await posts.getPostsFields(uniquePids, ['pid', 'uid', 'timestamp']);
        const result = await plugins.hooks.fire('filter:topics.getPostReplies', {
            uid: callerUid,
            replies: replyData,
        });
        replyData = await user.blocks.filter(callerUid, result.replies);

        const uids = replyData.map(replyData => replyData && replyData.uid);

        const uniqueUids = _.uniq(uids);

        const userData = await user.getUsersWithFields(uniqueUids, ['uid', 'username', 'userslug', 'picture'], callerUid);

        const uidMap = _.zipObject(uniqueUids, userData);
        const pidMap = _.zipObject(replyData.map(r => r.pid), replyData);

        const returnData = arrayOfReplyPids.map((replyPids) => {
            replyPids = replyPids.filter(pid => pidMap[pid]);
            const uidsUsed = {};
            const currentData = {
                hasMore: false,
                users: [],
                text: replyPids.length > 1 ? `[[topic:replies_to_this_post, ${replyPids.length}]]` : '[[topic:one_reply_to_this_post]]',
                count: replyPids.length,
                timestampISO: replyPids.length ? utils.toISOString(pidMap[replyPids[0]].timestamp) : undefined,
            };

            replyPids.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

            replyPids.forEach((replyPid) => {
                const replyData = pidMap[replyPid];
                if (!uidsUsed[replyData.uid] && currentData.users.length < 6) {
                    currentData.users.push(uidMap[replyData.uid]);
                    uidsUsed[replyData.uid] = true;
                }
            });

            if (currentData.users.length > 5) {
                currentData.users.pop();
                currentData.hasMore = true;
            }

            return currentData;
        });
        // Assert function return types in the body
        assert(typeof returnData === 'object', 'returnData must be an object');
        return returnData;
    }

    // Asynchronously syncs backlinks for a given post's content.
    /**
     * @param {Promise<object>} postData
     * @returns {Promise<number>}
    */
    Topics.syncBacklinks = async (postData) => {
        // Assert function parameter types in the body
        if (!postData) {
            throw new Error('[[error:invalid-data]]');
        }

        // Scan post content for topic links
        const matches = [...postData.content.matchAll(backlinkRegex)];
        if (!matches) {
            return 0;
        }

        const { pid, uid, tid } = postData;
        let add = _.uniq(matches.map(match => match[1]).map(tid => parseInt(tid, 10)));

        const now = Date.now();
        const topicsExist = await Topics.exists(add);
        const current = (await db.getSortedSetMembers(`pid:${pid}:backlinks`)).map(tid => parseInt(tid, 10));
        const remove = current.filter(tid => !add.includes(tid));
        add = add.filter((_tid, idx) => topicsExist[idx] && !current.includes(_tid) && tid !== _tid);

        // Remove old backlinks
        await db.sortedSetRemove(`pid:${pid}:backlinks`, remove);

        // Add new backlinks
        await db.sortedSetAdd(`pid:${pid}:backlinks`, add.map(() => now), add);
        await Promise.all(add.map(async (tid) => {
            await Topics.events.log(tid, {
                uid,
                type: 'backlink',
                href: `/post/${pid}`,
            });
        }));
        const result = add.length + (current - remove);
        // Assert function return types in the body
        assert(typeof result === 'number', 'result must be a number');
        return result;
    };
};
