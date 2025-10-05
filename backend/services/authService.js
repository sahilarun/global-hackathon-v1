const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

class AuthService {
  constructor(database) {
    this.db = database;
  }

  async createUser(email, password, name) {
    try {
      const existingUser = await this.db.getUserByEmail(email);
      if (existingUser) {
        throw new Error('User already exists');
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      
      const user = {
        id: uuidv4(),
        email,
        password: hashedPassword,
        name,
        created_at: new Date().toISOString()
      };

      await this.db.insertUser(user);
      return this.generateTokens(user);
    } catch (error) {
      throw error;
    }
  }

  async login(email, password) {
    try {
      const user = await this.db.getUserByEmail(email);
      if (!user) {
        throw new Error('Invalid credentials');
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        throw new Error('Invalid credentials');
      }

      return this.generateTokens(user);
    } catch (error) {
      throw error;
    }
  }

  async refreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
      const user = await this.db.getUserById(decoded.userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      return this.generateTokens(user);
    } catch (error) {
      throw error;
    }
  }

  generateTokens(user) {
    const accessToken = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
      { userId: user.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    };
  }

  async validateToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      return decoded;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = AuthService;
