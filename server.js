const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

// ========================================
// CONFIGURACIÓN MIDDLEWARE
// ========================================

app.use(cors({
    origin: ['http://localhost:3000', 'https://your-frontend-domain.com'],
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ========================================
// CONFIGURACIÓN GEMINI AI
// ========================================

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: process.env.GEMINI_MODEL || 'gemini-1.5-pro-latest' 
});

// ========================================
// PROMPT ESPECIALIZADO EN RENTA COLOMBIA
// ========================================

const SYSTEM_PROMPT = `Eres un experto contador público especializado en declaración de renta en Colombia para el año gravable 2024 (declaración 2025).

INFORMACIÓN ACTUALIZADA 2025:
- Tope ingresos: $63.350.000
- Tope patrimonio: $196.607.000  
- Tope consumos: $63.350.000
- Tope consignaciones: $95.025.000
- UVT 2025: $47.488
- Renta exenta empleados: 25% hasta $759.808 mensuales
- Deducción dependientes: $1.519.616 (menores 18), $759.808 (18-23 estudiando)
- Deducción medicina: $759.808 anuales
- Deducción educación: 25% ingresos laborales
- Deducción intereses vivienda: $56.985.600 anuales

FECHAS DECLARACIÓN 2025 (por últimos dos dígitos de cédula):
01-02: 12 agosto | 03-04: 13 agosto | 05-06: 14 agosto | 07-08: 15 agosto
09-10: 19 agosto | 11-12: 20 agosto | 13-14: 21 agosto | 15-16: 22 agosto
17-18: 25 agosto | 19-20: 26 agosto | 21-22: 27 agosto | 23-24: 28 agosto
25-26: 29 agosto | 27-28: 1 sept | 29-30: 2 sept | 31-32: 3 sept
33-34: 4 sept | 35-36: 5 sept | 37-38: 8 sept | 39-40: 9 sept
41-42: 10 sept | 43-44: 11 sept | 45-46: 12 sept | 47-48: 15 sept
49-50: 16 sept | 51-52: 17 sept | 53-54: 18 sept | 55-56: 19 sept
57-58: 22 sept | 59-60: 23 sept | 61-62: 24 sept | 63-64: 25 sept
65-66: 26 sept | 67-68: 1 oct | 69-70: 2 oct | 71-72: 3 oct
73-74: 6 oct | 75-76: 7 oct | 77-78: 8 oct | 79-80: 9 oct
81-82: 10 oct | 83-84: 14 oct | 85-86: 15 oct | 87-88: 16 oct
89-90: 17 oct | 91-92: 20 oct | 93-94: 21 oct | 95-96: 22 oct
97-98: 23 oct | 99-00: 24 oct

INSTRUCCIONES:
1. Responde SOLO sobre declaración de renta Colombia
2. Si detectas número de cédula, calcula fecha exacta
3. Usa formato claro con emojis y negritas
4. Incluye cálculos específicos cuando sea posible
5. Menciona sanciones si la fecha ya pasó
6. Sé preciso con cifras y fechas
7. Sugiere asesoría personalizada para casos complejos`;

// ========================================
// RUTAS DE LA API
// ========================================

// Health check para Railway
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        service: 'Tax Chat Backend',
        version: '1.0.0'
    });
});

// Ruta principal
app.get('/', (req, res) => {
    res.json({
        message: 'Tax Chat Backend API',
        status: 'running',
        endpoints: {
            health: '/api/health',
            chat: '/api/chat/message'
        },
        timestamp: new Date().toISOString()
    });
});

// API Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        ai: 'gemini-1.5-pro',
        timestamp: new Date().toISOString() 
    });
});

// Endpoint principal del chat
app.post('/api/chat/message', async (req, res) => {
    try {
        const { message, userContext = {} } = req.body;

        if (!message || typeof message !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Message is required and must be a string'
            });
        }

        // Verificar configuración de Gemini
        if (!process.env.GEMINI_API_KEY) {
            console.error('❌ GEMINI_API_KEY no configurada');
            return res.status(500).json({
                success: false,
                error: 'AI service not configured',
                fallback: true
            });
        }

        console.log(`📝 Procesando mensaje: "${message.substring(0, 50)}..."`);

        // Preparar prompt completo
        const fullPrompt = `${SYSTEM_PROMPT}

CONTEXTO DEL USUARIO:
- Timestamp: ${userContext.timestamp || new Date().toISOString()}
- Timezone: ${userContext.timezone || 'America/Bogota'}

PREGUNTA DEL USUARIO: ${message}`;

        // Llamar a Gemini
        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        const aiResponse = response.text();

        console.log('✅ Respuesta generada exitosamente');

        res.json({
            success: true,
            response: aiResponse,
            metadata: {
                source: 'gemini-1.5-pro',
                timestamp: new Date().toISOString(),
                model: process.env.GEMINI_MODEL || 'gemini-1.5-pro-latest'
            }
        });

    } catch (error) {
        console.error('❌ Error en /api/chat/message:', error);
        
        // Error específico de Gemini
        if (error.message?.includes('API_KEY')) {
            return res.status(500).json({
                success: false,
                error: 'Invalid API key configuration',
                fallback: true
            });
        }

        // Error de rate limit
        if (error.message?.includes('quota') || error.message?.includes('limit')) {
            return res.status(429).json({
                success: false,
                error: 'Rate limit exceeded, please try again later',
                fallback: true
            });
        }

        // Error genérico
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            fallback: true,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Manejo de rutas no encontradas
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route not found',
        availableRoutes: [
            'GET /',
            'GET /health',
            'GET /api/health',
            'POST /api/chat/message'
        ]
    });
});

// ========================================
// INICIALIZACIÓN DEL SERVIDOR
// ========================================

const PORT = process.env.PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Tax Chat Backend iniciado exitosamente`);
    console.log(`📍 Puerto: ${PORT}`);
    console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🤖 Modelo IA: ${process.env.GEMINI_MODEL || 'gemini-1.5-pro-latest'}`);
    console.log(`🔑 API Key configurada: ${process.env.GEMINI_API_KEY ? '✅ Sí' : '❌ No'}`);
    console.log(`📡 Health check: http://localhost:${PORT}/health`);
    console.log(`🔗 API endpoint: http://localhost:${PORT}/api/chat/message`);
});

// Manejo de errores no capturados
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});
            
