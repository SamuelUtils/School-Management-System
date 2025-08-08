import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'School Management System API',
            version: '1.0.0',
            description: 'API documentation for the School Management System',
            contact: {
                name: 'API Support',
                email: 'support@schoolmanagementsystem.com'
            },
            license: {
                name: 'MIT',
                url: 'https://opensource.org/licenses/MIT'
            }
        },
        servers: [
            {
                url: 'http://localhost:3000/api',
                description: 'Development server'
            }
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                }
            },
            schemas: {
                Error: {
                    type: 'object',
                    properties: {
                        message: {
                            type: 'string',
                            description: 'Error message'
                        },
                        code: {
                            type: 'string',
                            description: 'Error code'
                        }
                    }
                },
                User: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            format: 'uuid'
                        },
                        name: {
                            type: 'string'
                        },
                        phone: {
                            type: 'string'
                        },
                        role: {
                            type: 'string',
                            enum: ['ADMIN', 'TEACHER', 'PARENT']
                        },
                        createdAt: {
                            type: 'string',
                            format: 'date-time'
                        },
                        updatedAt: {
                            type: 'string',
                            format: 'date-time'
                        }
                    }
                },
                LoginRequest: {
                    type: 'object',
                    required: ['phone', 'password'],
                    properties: {
                        phone: {
                            type: 'string',
                            example: '+1234567890'
                        },
                        password: {
                            type: 'string',
                            format: 'password',
                            example: 'password123'
                        }
                    }
                },
                LoginResponse: {
                    type: 'object',
                    properties: {
                        token: {
                            type: 'string',
                            description: 'JWT token'
                        },
                        user: {
                            $ref: '#/components/schemas/User'
                        }
                    }
                }
            }
        },
        security: [{
            bearerAuth: []
        }]
    },
    apis: ['./src/routes/*.ts', './src/controllers/*.ts'], // Path to the API docs
};

export const swaggerSpec = swaggerJsdoc(options); 