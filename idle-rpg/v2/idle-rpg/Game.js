const Database = require('../../database/Database');
const Events = require('./data/events/Events');
const Map = require('../../game/utils/Map');
const Commands = require('../idle-rpg/data/Commands');
const { newQuest } = require('../../../idle-rpg/database/schemas/quest');
const { errorLog, infoLog } = require('../../utils/logger');

class Game {

  constructor(Helper) {
    this.activeSpells = [];

    this.Helper = Helper;
    this.Database = new Database(Helper);
    this.Map = new Map(Helper);
    this.Events = new Events({ Helper: this.Helper, Map: this.Map, Database: this.Database });
    this.Commands = new Commands({ Helper: this.Helper, Database: this.Database, Events: this.Events, MapManager: this.Map });
    this.Database.resetPersonalMultipliers();
  }

  async activateEvent(guildId, player, onlinePlayers) {
    try {
      const loadedPlayer = await this.Database.loadPlayer(player.discordId);
      if (!loadedPlayer) {
        const newPlayer = await this.Database.createNewPlayer(player.discordId, player.guildId, player.name);

        return await this.updatePlayer({
          type: 'actions',
          updatedPlayer: newPlayer,
          msg: [`${this.Helper.generatePlayerName(newPlayer, true)} was born in \`${newPlayer.map.name}\`! Welcome to the world of Idle-RPG!`],
          pm: ['You were born.']
        });
      }
      if (loadedPlayer.guildId === 'None') {
        loadedPlayer.guildId = guildId;
      }
      if (loadedPlayer.guildId !== guildId) {
        return;
      }
      if (!loadedPlayer.quest || loadedPlayer.quest && !loadedPlayer.quest.questMob) {
        loadedPlayer.quest = newQuest;
      }

      const loadedGuildConfig = await this.Database.loadGame(player.guildId);
      console.log(`User: ${player.name} - GuildId: ${loadedPlayer.guildId} - Multi: ${loadedGuildConfig.multiplier} - Bless: ${loadedGuildConfig.spells.activeBless} - PM: ${loadedPlayer.personalMultiplier}`);
      await this.Helper.passiveRegen(loadedPlayer, ((5 * loadedPlayer.level) / 4) + (loadedPlayer.stats.end / 8), ((5 * loadedPlayer.level) / 4) + (loadedPlayer.stats.int / 8));
      const eventResults = await this.selectEvent(loadedGuildConfig, loadedPlayer, onlinePlayers);
      const msgResults = await this.updatePlayer(eventResults);

      return msgResults;
    } catch (err) {
      errorLog.error(err);
    }
  }

  async selectEvent(loadedGuildConfig, loadedPlayer, onlinePlayers) {
    try {
      const randomEvent = await this.Helper.randomBetween(0, 2);
      switch (randomEvent) {
        case 0:
          return this.Events.moveEvent(loadedPlayer);
        case 1:
          return this.Events.attackEvent(loadedPlayer, onlinePlayers, loadedGuildConfig.multiplier);
        case 2:
          return this.Events.luckEvent(loadedPlayer, loadedGuildConfig.events, loadedGuildConfig.multiplier);
      }
    } catch (err) {
      errorLog.error(err);
    }
  }

  async updatePlayer(eventResults) {
    eventResults.updatedPlayer.events++;
    await this.Database.savePlayer(eventResults.updatedPlayer);
    return eventResults;
  }

  dbClass() {
    return this.Database;
  }

  async loadGuildConfig(guildId) {
    const loadedConfig = await this.Database.loadGame(guildId);
    if (loadedConfig.spells.activeBless === 0) {
      loadedConfig.multiplier = 1;
      await this.Database.updateGame(guildId, loadedConfig);
    }
    if (loadedConfig.multiplier === 1 && loadedConfig.spells.activeBless === 1) {
      loadedConfig.multiplier = 1;
      loadedConfig.spells.activeBless = 0;
      await this.Database.updateGame(guildId, loadedConfig);
    }
    console.log(`
    Config loaded for guild ${guildId}
    Multiplier:${loadedConfig.multiplier}
    Active Bless:${loadedConfig.spells.activeBless}
    Prize Pool:${loadedConfig.dailyLottery.prizePool}\n`);
    for (let i = 0; i < loadedConfig.spells.activeBless; i++) {
      setTimeout(() => {
        infoLog.info(guildId);
        loadedConfig.spells.activeBless--;
        loadedConfig.multiplier--;
        loadedConfig.spells.activeBless = loadedConfig.spells.activeBless <= 0 ? 1 : loadedConfig.spells.activeBless;
        this.Database.updateGame(guildId, loadedConfig);
      }, 1800000 + (5000 * i));
    }
  }

  fetchCommand(params) {
    return this.Commands[params.command](params);
  }

}
module.exports = Game;
