const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
    process.env.DB_DATABASE || 'primer-parcial',
    process.env.DB_USERNAME || 'postgres',
    process.env.DB_PASSWORD || '1234',
    {
        host: process.env.DB_HOST || '127.0.0.1',
        port: process.env.DB_PORT || 5432,
        dialect: 'postgres',
        logging: false,
        pool: {
            max: 5,
            min: 0,
            acquire: 30000,
            idle: 10000
        },
        define: {
            timestamps: true,
            underscored: true // Esto hará que los nombres de las columnas usen snake_case como Laravel
        }
    }
);

const connectDB = async () => {
    try {
        await sequelize.authenticate();
        console.log('PostgreSQL Connected');
        
        // Sincronizar modelos con la base de datos
        // En producción, deberías usar migraciones en lugar de sync
        if (process.env.NODE_ENV === 'development') {
            await sequelize.sync();
            console.log('Database synchronized');
        }
    } catch (error) {
        console.error('Unable to connect to the database:', error);
        process.exit(1);
    }
};

module.exports = { sequelize, connectDB }; 