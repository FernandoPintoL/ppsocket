const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Room = sequelize.define('rooms', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    room_id: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false
    },
    users: {
        type: DataTypes.JSON, // O Sequelize.ARRAY(DataTypes.STRING) si prefieres un array
        allowNull: false,
        defaultValue: []
    },
    last_activity: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'rooms',
    timestamps: true,
    underscored: true
});

// Método para actualizar la última actividad
Room.prototype.updateActivity = async function() {
    this.last_activity = new Date();
    return this.save();
};

// Método para añadir un usuario
Room.prototype.addUser = async function(user) {
    if (!this.users.includes(user)) {
        this.users = [...this.users, user];
        return this.save();
    }
    return this;
};

// Método para remover un usuario
Room.prototype.removeUser = async function(user) {
    this.users = this.users.filter(u => u !== user);
    return this.save();
};

module.exports = Room; 