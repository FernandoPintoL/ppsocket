const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Message = sequelize.define('messages', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    pizarra_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    room_id: {
        type: DataTypes.STRING,
        allowNull: false
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    user_name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    text: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    timestamp: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'messages',
    timestamps: true,
    underscored: true
});

// Get messages for a specific room
Message.getMessagesByRoom = async function(roomId, limit = 50) {
    return await this.findAll({
        where: { room_id: roomId },
        order: [['timestamp', 'DESC']],
        limit: limit
    });
};

module.exports = Message;