const { Client, GatewayIntentBits } = require('discord.js');
const {
    joinVoiceChannel,
    getVoiceConnection,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    NoSubscriberBehavior,
} = require('@discordjs/voice');
const play = require('play-dl');
const http = require('http');

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running!');
}).listen(process.env.PORT || 3000);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play },
});

let currentUrl = null;

async function createResource(url) {
    if (play.yt_validate(url) === 'video') {
        const stream = await play.stream(url);
        return createAudioResource(stream.stream, { inputType: stream.type });
    }
    return createAudioResource(url);
}

async function playUrl(url) {
    const resource = await createResource(url);
    player.play(resource);
    currentUrl = url;
}

player.on(AudioPlayerStatus.Idle, async () => {
    if (!currentUrl) return;
    try {
        await playUrl(currentUrl);
    } catch (e) {
        console.error('Replay error:', e.message);
    }
});

player.on('error', error => console.error('Player error:', error.message));

function connectToChannel(channel) {
    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: true,
    });

    connection.subscribe(player);

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
            await Promise.race([
                entersState(connection, VoiceConnectionStatus.Signalling, 5000),
                entersState(connection, VoiceConnectionStatus.Connecting, 5000),
            ]);
        } catch {
            connection.destroy();
            setTimeout(() => connectToChannel(channel), 5000);
        }
    });

    return connection;
}

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const [cmd, ...args] = message.content.trim().split(/\s+/);

    if (cmd === '!join') {
        const channel = message.member.voice.channel;
        if (!channel) return message.reply('You need to join a voice channel first!');
        connectToChannel(channel);
        message.reply('Joined the voice channel ✅');
    }

    if (cmd === '!play') {
        const url = args[0];
        if (!url) return message.reply('Usage: `!play <url>`');

        const channel = message.member.voice.channel;
        if (!channel) return message.reply('You need to join a voice channel first!');

        if (!getVoiceConnection(message.guild.id)) connectToChannel(channel);

        try {
            await playUrl(url);
            message.reply('Now playing 🎵 (loops automatically)');
        } catch (e) {
            console.error(e);
            message.reply('Could not play this link: ' + e.message);
        }
    }

    if (cmd === '!stop') {
        currentUrl = null;
        player.stop();
        message.reply('Stopped playback ⏹️');
    }

    if (cmd === '!leave') {
        currentUrl = null;
        player.stop();
        const connection = getVoiceConnection(message.guild.id);
        if (connection) {
            connection.destroy();
            message.reply('Left the voice channel.');
        } else {
            message.reply('I am not in any voice channel!');
        }
    }
});

client.login(process.env.TOKEN);
