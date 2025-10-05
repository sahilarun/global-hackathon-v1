const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

class DatabaseService {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  async getUserByEmail(email) {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('id, email, password, name')
        .eq('email', email)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error) {
      logger.error('Error fetching user by email:', error);
      throw error;
    }
  }

  async getUserById(id) {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('id, email, name')
        .eq('id', id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error) {
      logger.error('Error fetching user by id:', error);
      throw error;
    }
  }

  async insertUser(userData) {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .insert([userData])
        .select('id, email, name')
        .maybeSingle();

      if (error) throw error;
      return data || null;
    } catch (error) {
      logger.error('Error inserting user:', error);
      throw error;
    }
  }

  async insertActivity(activityData) {
    try {
      const { data, error } = await this.supabase
        .from('activities')
        .insert([{
          title: activityData.title,
          url: activityData.url,
          favicon: activityData.favicon,
          description: activityData.description,
          timestamp_start: activityData.timestamp_start,
          timestamp_end: activityData.timestamp_end,
          time_spent: activityData.time_spent,
          activity_type: activityData.activity_type || 'website',
          mood: activityData.mood,
          productivity_score: activityData.productivity_score,
          ai_summary: activityData.ai_summary
        }])
        .select();

      if (error) {
        logger.error('Error inserting activity:', error);
        throw error;
      }

      return data[0];
    } catch (error) {
      logger.error('Database insert error:', error);
      throw error;
    }
  }

  async getActivitiesByDateRange(startDate, endDate, userId = null) {
    try {
      let query = this.supabase
        .from('activities')
        .select('*')
        .gte('timestamp_start', startDate)
        .lte('timestamp_start', endDate)
        .order('timestamp_start', { ascending: false });

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Error fetching activities:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error('Database query error:', error);
      throw error;
    }
  }

  async getDailyActivities(date, userId = null) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return this.getActivitiesByDateRange(
      startOfDay.toISOString(),
      endOfDay.toISOString(),
      userId
    );
  }

  async getWeeklyActivities(startDate, userId = null) {
    const weekStart = new Date(startDate);
    const weekEnd = new Date(startDate);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    return this.getActivitiesByDateRange(
      weekStart.toISOString(),
      weekEnd.toISOString(),
      userId
    );
  }

  async getActivityStats(startDate, endDate, userId = null) {
    try {
      const activities = await this.getActivitiesByDateRange(startDate, endDate, userId);
      
      const stats = {
        total_activities: activities.length,
        total_time: activities.reduce((sum, act) => sum + (act.time_spent || 0), 0),
        productive_hours: Math.round(
          activities
            .filter(act => (act.productivity_score || 0) > 60)
            .reduce((sum, act) => sum + (act.time_spent || 0), 0) / 3600 * 10
        ) / 10,
        happy_moments: activities.filter(act => act.mood === 'happy').length,
        average_productivity: this.calculateAverageProductivity(activities),
        top_sites: this.getTopSites(activities),
        hourly_distribution: this.getHourlyDistribution(activities)
      };

      return stats;
    } catch (error) {
      logger.error('Error calculating stats:', error);
      throw error;
    }
  }

  async getCalendarData(month, year, userId = null) {
    try {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);

      const activities = await this.getActivitiesByDateRange(
        startDate.toISOString(),
        endDate.toISOString(),
        userId
      );

      const calendarData = {};
      
      activities.forEach(activity => {
        const date = new Date(activity.timestamp_start).toISOString().split('T')[0];
        if (!calendarData[date]) {
          calendarData[date] = {
            activities: [],
            total_time: 0,
            productivity_score: 0,
            top_sites: []
          };
        }
        
        calendarData[date].activities.push(activity);
        calendarData[date].total_time += activity.time_spent || 0;
      });

      Object.keys(calendarData).forEach(date => {
        const dayData = calendarData[date];
        dayData.productivity_score = this.calculateAverageProductivity(dayData.activities);
        dayData.top_sites = this.getTopSites(dayData.activities).slice(0, 3);
      });

      return calendarData;
    } catch (error) {
      logger.error('Error getting calendar data:', error);
      throw error;
    }
  }

  calculateAverageProductivity(activities) {
    if (activities.length === 0) return 0;
    const total = activities.reduce((sum, act) => sum + (act.productivity_score || 50), 0);
    return Math.round(total / activities.length);
  }

  getTopSites(activities) {
    const siteMap = {};
    activities.forEach(activity => {
      if (activity.url) {
        try {
          const domain = new URL(activity.url).hostname;
          siteMap[domain] = (siteMap[domain] || 0) + (activity.time_spent || 0);
        } catch (e) {
          // Invalid URL, skip
        }
      }
    });
    
    return Object.entries(siteMap)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([domain, time]) => ({ domain, time: Math.round(time / 60) }));
  }

  getHourlyDistribution(activities) {
    const hourlyData = Array(24).fill(0);
    
    activities.forEach(activity => {
      const hour = new Date(activity.timestamp_start).getHours();
      hourlyData[hour] += activity.time_spent || 0;
    });

    return hourlyData.map((seconds, hour) => ({
      hour: `${hour}:00`,
      minutes: Math.round(seconds / 60)
    }));
  }

  async searchActivities(query, userId = null) {
    try {
      let dbQuery = this.supabase
        .from('activities')
        .select('*')
        .order('timestamp_start', { ascending: false });

      if (userId) {
        dbQuery = dbQuery.eq('user_id', userId);
      }

      if (query) {
        dbQuery = dbQuery.or(`title.ilike.%${query}%,description.ilike.%${query}%,ai_summary.ilike.%${query}%`);
      }

      const { data, error } = await dbQuery;

      if (error) {
        logger.error('Error searching activities:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error('Search error:', error);
      throw error;
    }
  }
}

module.exports = new DatabaseService();
