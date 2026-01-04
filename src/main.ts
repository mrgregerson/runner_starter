import Phaser from "phaser";

const WIDTH = 720;
const HEIGHT = 720;

const BASE_SPEED = 360;
const MAX_SPEED = 900; // cap so difficulty doesn't become impossible

// Ground setup (less dead spacer)
const GROUND_HEIGHT = 180;
const GROUND_Y = HEIGHT - GROUND_HEIGHT; // surface line

// Physics (base)
const GRAVITY_Y_BASE = 1800;
const JUMP_VEL_BASE = 720; // positive magnitude

// Slide timing
const SLIDE_MIN_MS = 220;          // keyboard hold minimum
const TOUCH_SLIDE_MS_BASE = 1000;  // swipe-down slide duration at start
const TOUCH_SLIDE_MS_MIN = 420;    // never shorter than this

class RunnerScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private ground!: Phaser.GameObjects.Rectangle;

  private obstacles!: Phaser.Physics.Arcade.Group;
  private speed = BASE_SPEED;
  private score = 0;
  private scoreText!: Phaser.GameObjects.Text;

  private jumpKey!: Phaser.Input.Keyboard.Key;
  private downKey!: Phaser.Input.Keyboard.Key;
  private sKey!: Phaser.Input.Keyboard.Key;

  // Touch gesture state
  private touchStartX = 0;
  private touchStartY = 0;
  private touchGestureFired = false;

  private isSliding = false;
  private slideMinUntil = 0;

  private nextSpawnAt = 0;
  private gameIsOver = false;

  constructor() {
    super("RunnerScene");
  }

  create() {
    // --- Reset run state on every restart ---
    this.speed = BASE_SPEED;
    this.score = 0;
    this.isSliding = false;
    this.slideMinUntil = 0;
    this.gameIsOver = false;

    // Reset gesture state
    this.touchGestureFired = false;

    // Background
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x1a1a1a);

    // Keys
    this.sKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.jumpKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.downKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.UP).on("down", () => this.tryJump());

    // Ground (drawn below the surface line)
    this.ground = this.add.rectangle(
      WIDTH / 2,
      GROUND_Y + GROUND_HEIGHT / 2,
      WIDTH * 2,
      GROUND_HEIGHT,
      0x222222
    );
    this.physics.add.existing(this.ground, true);


    // Create textures
    this.makeTextures();

    // Player
    this.player = this.physics.add.sprite(150, GROUND_Y, "player");
    this.player.setOrigin(0.5, 1);
    this.player.setCollideWorldBounds(true);
    this.player.setGravityY(GRAVITY_Y_BASE);

    // Hitbox (standing)
    this.setPlayerHitboxStanding();

    // Collide with ground
    this.physics.add.collider(this.player, this.ground as any);

    // Obstacles
    this.obstacles = this.physics.add.group({
      allowGravity: false,
      immovable: true,
    });

    this.physics.add.overlap(this.player, this.obstacles, () => this.gameOver(), undefined, this);

    // Score UI
    this.scoreText = this.add.text(18, 18, "Score: 0", {
      fontFamily: "system-ui, Arial",
      fontSize: "28px",
      color: "#f5e6b3",
    });

    this.physics.world.setBounds(0, 0, WIDTH, HEIGHT);

    // Spawn timing
    this.nextSpawnAt = this.time.now + 900;

    // Mobile controls: swipe up = jump, swipe down = slide (no tap)
    const SWIPE_Y_THRESHOLD = 55; // tweak 40–80 for sensitivity
    const SWIPE_X_TOLERANCE = 80; // ignore mostly-horizontal moves

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.gameIsOver) return;

      this.touchStartX = p.x;
      this.touchStartY = p.y;
      this.touchGestureFired = false;
    });

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (this.gameIsOver) return;
      if (!p.isDown) return;
      if (this.touchGestureFired) return;

      const dx = p.x - this.touchStartX;
      const dy = p.y - this.touchStartY;

      // If it's mostly horizontal, ignore it
      if (Math.abs(dx) > SWIPE_X_TOLERANCE && Math.abs(dx) > Math.abs(dy)) return;

      // Swipe down => slide (fixed duration for touch)
      if (dy > SWIPE_Y_THRESHOLD) {
        this.touchGestureFired = true;
        this.startSlideFor(this.time.now, this.getTouchSlideDurationMs());
        return;
      }

      // Swipe up => jump
      if (dy < -SWIPE_Y_THRESHOLD) {
        this.touchGestureFired = true;
        this.tryJump();
        return;
      }
    });

    this.input.on("pointerup", () => {
      this.touchGestureFired = false;
    });
  }

  update(time: number, delta: number) {
    if (this.gameIsOver) return;
  
    // Speed ramp + cap
    this.speed = Math.min(MAX_SPEED, this.speed + delta * 0.015);
  
    // Make gravity scale with speed so the jump resolves faster later on
    const f = this.getSpeedFactor();
    this.player.setGravityY(GRAVITY_Y_BASE * f);
  
    // Score
    this.score += (delta * this.speed) / 1000;
    this.scoreText.setText(`Score: ${Math.floor(this.score)}`);
  
    // Jump
    if (Phaser.Input.Keyboard.JustDown(this.jumpKey)) this.tryJump();
  
    // Slide: keyboard hold only (touch swipe triggers slide directly)
    const slideHeld = this.downKey.isDown || this.sKey.isDown;
  
    if (slideHeld) {
      this.startSlideFor(time, SLIDE_MIN_MS);
    } else {
      if (this.isSliding && time >= this.slideMinUntil) {
        this.endSlide();
      }
    }
  
    // Spawn obstacles
    if (time >= this.nextSpawnAt) {
      this.spawnObstacle();
  
      const minGap = 560;
      const maxGap = 920;
      const gap = Phaser.Math.Clamp(
        920 - (this.speed - BASE_SPEED) * 0.8,
        minGap,
        maxGap
      );
      this.nextSpawnAt = time + gap;
    }
  
    // Move obstacles left
    this.obstacles.getChildren().forEach((o) => {
      const obs = o as Phaser.Physics.Arcade.Sprite;
      obs.x -= (this.speed * delta) / 1000;
      if (obs.x < -200) obs.destroy();
    });
  }
  
  private getSpeedFactor() {
    // 1.0 at base speed, up to MAX_SPEED/BASE_SPEED
    return Phaser.Math.Clamp(this.speed / BASE_SPEED, 1, MAX_SPEED / BASE_SPEED);
  }
  
  private getTouchSlideDurationMs() {
    // Start at 1000ms, gently shorten as speed increases (but never below min).
    // If you want it ALWAYS 1000ms, just: return TOUCH_SLIDE_MS_BASE;
    const f = this.getSpeedFactor();
    const raw = TOUCH_SLIDE_MS_BASE * Math.pow(1 / f, 0.3);
    return Math.round(Phaser.Math.Clamp(raw, TOUCH_SLIDE_MS_MIN, TOUCH_SLIDE_MS_BASE));
  }
   
  private tryJump() {
    const onGround = (this.player.body as Phaser.Physics.Arcade.Body).blocked.down;
    if (!onGround) return;
  
    if (this.isSliding) this.endSlide();
  
    // Keep jump height similar but shorten airtime as speed increases:
    // gravity scales by f, jump velocity scales by sqrt(f)
    const f = this.getSpeedFactor();
    const jumpVel = -JUMP_VEL_BASE * Math.sqrt(f);
  
    this.player.setVelocityY(jumpVel);
  }
  
  private startSlideFor(time: number, durationMs: number) {
    const onGround = (this.player.body as Phaser.Physics.Arcade.Body).blocked.down;
    if (!onGround) return;
  
    if (!this.isSliding) {
      this.isSliding = true;
      this.setPlayerHitboxSliding();
    }
  
    // Extend slide end time if called again (safe for holds / repeated swipes)
    this.slideMinUntil = Math.max(this.slideMinUntil, time + durationMs);
  }

  private endSlide() {
    this.isSliding = false;
    this.setPlayerHitboxStanding();
  }

  private spawnObstacle() {
    const type = Phaser.Math.Between(0, 1);

    if (type === 0) {
      // LOW hurdle: must JUMP (now half-size)
      const hurdle = this.physics.add.sprite(WIDTH + 120, GROUND_Y, "hurdle");
      hurdle.setOrigin(0.5, 1);

      // Hitbox roughly matches 40x35 texture
      hurdle.body.setSize(36, 31, true);
      hurdle.body.setOffset(2, 2);

      hurdle.setImmovable(true);
      hurdle.body.allowGravity = false;
      this.obstacles.add(hurdle);
    } else {
      
      // HIGH bar: must SLIDE under (now half-length)
      const barBottomY = GROUND_Y - 105;
      const bar = this.physics.add.sprite(WIDTH + 120, barBottomY, "bar");
      bar.setOrigin(0.5, 1);

      // Hitbox roughly matches 70x34 texture
      bar.body.setSize(65, 26, true);
      bar.body.setOffset(2, 4);

      bar.setImmovable(true);
      bar.body.allowGravity = false;
      this.obstacles.add(bar);
    }
  }

  private gameOver() {
    this.gameIsOver = true;
    this.scoreText.setText(`Score: ${Math.floor(this.score)}`);
    this.physics.pause();

    const panel = this.add.rectangle(WIDTH / 2, HEIGHT / 2, 420, 240, 0x000000, 0.65);
    panel.setStrokeStyle(2, 0xf5e6b3, 1);

    this.add
      .text(WIDTH / 2, HEIGHT / 2 - 40, "GAME OVER", {
        fontFamily: "system-ui, Arial",
        fontSize: "48px",
        color: "#f5e6b3",
      })
      .setOrigin(0.5);

    this.add
      .text(WIDTH / 2, HEIGHT / 2 + 15, `Score: ${Math.floor(this.score)}`, {
        fontFamily: "system-ui, Arial",
        fontSize: "28px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    this.add
      .text(WIDTH / 2, HEIGHT / 2 + 70, "Swipe/Tap to Restart", {
        fontFamily: "system-ui, Arial",
        fontSize: "20px",
        color: "#cccccc",
      })
      .setOrigin(0.5);

    this.input.once("pointerdown", () => this.scene.restart());
    this.input.keyboard?.once("keydown", () => this.scene.restart());
  }

  private makeTextures() {
    const g = this.add.graphics();

    // Player (HALF WIDTH, same height)
    g.fillStyle(0xf5e6b3, 1);
    g.fillRoundedRect(0, 0, 45, 120, 14); // was 90 wide -> now 45
    g.lineStyle(4, 0x8a6b3a, 1);
    g.strokeRoundedRect(0, 0, 45, 120, 14);
    g.generateTexture("player", 45, 120);
    g.clear();

    // Hurdle (orange) — HALF SIZE (was 80x70, now 40x35)
    g.fillStyle(0xffaa33, 1);
    g.fillRect(0, 0, 40, 35);
    g.lineStyle(3, 0x6b3d00, 1);     // slightly thinner outline fits better
    g.strokeRect(0, 0, 40, 35);
    g.generateTexture("hurdle", 40, 35);
    g.clear();
   
    // Bar (blue) — HALF LENGTH (was 140x34, now 70x34)
    g.fillStyle(0x66ccff, 1);
    g.fillRect(0, 0, 70, 34);
    g.lineStyle(4, 0x003f55, 1);
    g.strokeRect(0, 0, 70, 34);
    g.generateTexture("bar", 70, 34);
   
    g.destroy();
  }

  private setPlayerHitboxStanding() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    
    // texture size is now 45x120
    body.setSize(35, 110, true);
    body.setOffset((45 - 35) / 2, 120 - 110);
    
    this.player.clearTint();
  }

  private setPlayerHitboxSliding() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
  
    // texture size is now 45x120
    body.setSize(42, 55, true);
    body.setOffset((45 - 42) / 2, 120 - 55);
  
    this.player.setTint(0xdde8ff);
  }
  
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: WIDTH,
  height: HEIGHT,
  parent: "app",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: "arcade",
    arcade: { debug: false },
  },
  scene: [RunnerScene],
};


new Phaser.Game(config);
