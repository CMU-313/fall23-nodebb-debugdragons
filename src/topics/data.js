'use strict';

const validator = require('validator');
const assert = require('assert');

const db = require('../database');
const categories = require('../categories');
const utils = require('../utils');
const translator = require('../translator');
const plugins = require('../plugins');

const intFields = [
    'tid', 'cid', 'uid', 'mainPid', 'postcount',
    'viewcount', 'postercount', 'deleted', 'locked', 'pinned',
    'pinExpiry', 'timestamp', 'upvotes', 'downvotes', 'lastposttime',
    'deleterUid', 'instructorcount', 'anonymous',
];

module.exports = function (Topics) {
    /**
     * Gets topics by fields
     * @param {Promise<object>} tids
     * @param {Promise<object>} fields
    * @returns {Promise<object>}
    */
    Topics.getTopicsFields = async function (tids, fields) {
        // Assert function parameter types in the body
        assert(typeof fields === 'object', 'Expected fields to be an object');
        if (!Array.isArray(tids) || !tids.length) {
            return [];
        }

        // "scheduled" is derived from "timestamp"
        if (fields.includes('scheduled') && !fields.includes('timestamp')) {
            fields.push('timestamp');
        }
        const keys = tids.map(tid => `topic:${tid}`);
        const topics = await db.getObjects(keys, fields);
        const result = await plugins.hooks.fire('filter:topic.getFields', {
            tids: tids,
            topics: topics,
            fields: fields,
            keys: keys,
        });
        result.topics.forEach(topic => modifyTopic(topic, fields));
        const topicsResult = result.topics;
        // Assert function return types in the body
        assert(typeof topicsResult === 'object', 'Expected result to be an object');
        return topicsResult;
    };

    /**
     * Gets topics field
     * @param {Promise<number> || Promise<string> || Promise<undefined>} tid
     * @param {Promise<string>} field
    * @returns {Promise<number> || Promise<string> || Promise<boolean>}
    */
    Topics.getTopicField = async function (tid, field) {
        // Assert function parameter types in the body
        assert(typeof tid === 'number' || typeof tid === 'string' || typeof tid === 'undefined', 'Expected tid to be a number or string or undefined');
        assert(typeof field === 'string', 'Expected field to be a string');
        const topic = await Topics.getTopicFields(tid, [field]);
        const result = topic ? topic[field] : null;
        // Assert function return types in the body
        assert(typeof result === 'number' || typeof result === 'string' || typeof result === 'boolean', 'Expected result to be a number or string or boolean');
        return result;
    };

    /**
     * Gets topics fields
     * @param {Promise<number> || Promise<string> || Promise<undefined>} tid
     * @param {Promise<object>} fields
    * @returns {Promise<object>}
    */
    Topics.getTopicFields = async function (tid, fields) {
        // Assert function parameter types in the body
        assert(typeof tid === 'number' || typeof tid === 'string' || typeof tid === 'undefined', 'Expected tid to be a number or string or undefined');
        assert(typeof fields === 'object', 'Expected fields to be an object');
        const topics = await Topics.getTopicsFields([tid], fields);
        const result = topics ? topics[0] : null;
        // Assert function return types in the body
        assert(typeof result === 'object', 'Expected result to be an object');
        return result;
    };

    /**
     * Gets data for the topic
     * @param {Promise<number> || Promise<string> || Promise<undefined>} tid
    * @returns {Promise<object>}
    */
    Topics.getTopicData = async function (tid) {
        // Assert function parameter types in the body
        assert(typeof tid === 'number' || typeof tid === 'string' || typeof tid === 'undefined', 'Expected tid to be a number or string or undefined');
        const topics = await Topics.getTopicsFields([tid], []);
        const result = topics && topics.length ? topics[0] : null;
        // Assert function return types in the body
        assert(typeof result === 'object', 'Expected result to be an object');
        return result;
    };

    /**
     * Gets all data for the topics
     * @param {Promise<object>} tids
    * @returns {Promise<object>}
    */
    Topics.getTopicsData = async function (tids) {
        // Assert function parameter types in the body
        assert(typeof tids === 'object', 'Expected tids to be an object');
        const result = await Topics.getTopicsFields(tids, []);
        // Assert function return types in the body
        assert(typeof result === 'object', 'Expected result to be an object');
        return result;
    };

    /**
     * Gets category data
     * @param {Promise<number> || Promise<string> || Promise<undefined>} tid
    * @returns {Promise<object>}
    */
    Topics.getCategoryData = async function (tid) {
        // Assert function parameter types in the body
        assert(typeof tid === 'number' || typeof tid === 'string' || typeof tid === 'undefined', 'Expected tid to be a number or string or undefined');
        const cid = await Topics.getTopicField(tid, 'cid');
        const result = await categories.getCategoryData(cid);
        // Assert function return types in the body
        assert(typeof result === 'object', 'Expected result to be an object');
        return result;
    };

    /**
     * Sets a field for a topic
     * @param {Promise<number> || Promise<string> || Promise<undefined>} tid
     * @param {Promise<string>} field
     * @param {Promise<number>} value
    * @returns {Promise<void>}
    */
    Topics.setTopicField = async function (tid, field, value) {
        // Assert function parameter types in the body
        assert(typeof tid === 'number' || typeof tid === 'string' || typeof tid === 'undefined', 'Expected tid to be a number or string or undefined');
        assert(typeof field === 'string', 'Expected field to be a string');
        assert(typeof value === 'number', 'Expected value to be a number');
        await db.setObjectField(`topic:${tid}`, field, value);
    };

    /**
     * Sets all fields for the topic
     * @param {Promise<number> || Promise<string> || Promise<undefined>} tid
     * @param {Promise<object>} data
    * @returns {Promise<void>}
    */
    Topics.setTopicFields = async function (tid, data) {
        // Assert function parameter types in the body
        assert(typeof tid === 'number' || typeof tid === 'string' || typeof tid === 'undefined', 'Expected tid to be a number or string or undefined');
        assert(typeof data === 'object', 'Expected data to be an object');
        await db.setObject(`topic:${tid}`, data);
    };

    /**
     * Delete a fields for a topic
     * @param {Promise<number> || Promise<string> || Promise<undefined>} tid
     * @param {Promise<string>} field
    * @returns {Promise<void>}
    */
    Topics.deleteTopicField = async function (tid, field) {
        // Assert function parameter types in the body
        assert(typeof tid === 'number' || typeof tid === 'string' || typeof tid === 'undefined', 'Expected tid to be a number or string or undefined');
        assert(typeof field === 'string', 'Expected field to be a string');
        await db.deleteObjectField(`topic:${tid}`, field);
    };

    /**
     * Delete all fields for a topic
     * @param {Promise<number> || Promise<string> || Promise<undefined>} tid
     * @param {Promise<string>} field
    * @returns {Promise<void>}
    */
    Topics.deleteTopicFields = async function (tid, fields) {
        // Assert function parameter types in the body
        assert(typeof tid === 'number' || typeof tid === 'string' || typeof tid === 'undefined', 'Expected tid to be a number or string or undefined');
        assert(typeof fields === 'object', 'Expected fields to be an object');
        await db.deleteObjectFields(`topic:${tid}`, fields);
    };
};

/**
 * Escapes the title in the topicData object
 * @param {Promise<object>} topicData
 * @returns {Promise<void>}
*/
function escapeTitle(topicData) {
    // Assert function parameter types in the body
    assert(typeof topicData === 'object', 'Expected topicData to be an object');
    if (topicData) {
        if (topicData.title) {
            topicData.title = translator.escape(validator.escape(topicData.title));
        }
        if (topicData.titleRaw) {
            topicData.titleRaw = translator.escape(topicData.titleRaw);
        }
    }
}

/**
 * Modifies a topic object with the provided fields
 * @param {Promise<object>} topic
 * @param {Promise<object>} fields
 * @returns {Promise<void>}
*/
function modifyTopic(topic, fields) {
    // Assert function parameter types in the body
    assert(typeof topic === 'object', 'Expected topic to be an object');
    assert(typeof fields === 'object', 'Expected fields to be an object');
    if (!topic) {
        return;
    }

    db.parseIntFields(topic, intFields, fields);

    if (topic.hasOwnProperty('title')) {
        topic.titleRaw = topic.title;
        topic.title = String(topic.title);
    }

    escapeTitle(topic);

    if (topic.hasOwnProperty('timestamp')) {
        topic.timestampISO = utils.toISOString(topic.timestamp);
        if (!fields.length || fields.includes('scheduled')) {
            topic.scheduled = topic.timestamp > Date.now();
        }
    }

    if (topic.hasOwnProperty('lastposttime')) {
        topic.lastposttimeISO = utils.toISOString(topic.lastposttime);
    }

    if (topic.hasOwnProperty('pinExpiry')) {
        topic.pinExpiryISO = utils.toISOString(topic.pinExpiry);
    }

    if (topic.hasOwnProperty('upvotes') && topic.hasOwnProperty('downvotes')) {
        topic.votes = topic.upvotes - topic.downvotes;
    }

    if (fields.includes('teaserPid') || !fields.length) {
        topic.teaserPid = topic.teaserPid || null;
    }

    if (fields.includes('tags') || !fields.length) {
        const tags = String(topic.tags || '');
        topic.tags = tags.split(',').filter(Boolean).map((tag) => {
            const escaped = validator.escape(String(tag));
            return {
                value: tag,
                valueEscaped: escaped,
                valueEncoded: encodeURIComponent(escaped),
                class: escaped.replace(/\s/g, '-'),
            };
        });
    }
}
