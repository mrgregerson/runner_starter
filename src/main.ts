import Phaser from "phaser";

const WIDTH = 720;
const HEIGHT = 720;
const BASE_SPEED = 360;

// Ground setup (less dead space)
const GROUND_HEIGHT = 180;
const GROUND_Y = HEIGHT - GROUND_HEIGHT; // surface line

// Slide behavior
const SLIDE_MIN_MS = 220;

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
    this.player.setGravityY(1800);

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

      // Swipe down => slide
      if (dy > SWIPE_Y_THRESHOLD) {
        this.touchGestureFired = true;
        this.startOrMaintainSlide(this.time.now); // triggers slide for at least SLIDE_MIN_MS
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

    // Speed ramp
    this.speed += delta * 0.015;

    // Score
    this.score += (delta * this.speed) / 1000;
    this.scoreText.setText(`Score: ${Math.floor(this.score)}`);

    // Jump
    if (Phaser.Input.Keyboard.JustDown(this.jumpKey)) this.tryJump();

    // Slide: keyboard hold only (touch swipe triggers slide directly)
    const slideHeld = this.downKey.isDown || this.sKey.isDown;

    if (slideHeld) {
      this.startOrMaintainSlide(time);
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
      const gap = Phaser.Math.Clamp(920 - (this.speed - 360) * 0.8, minGap, maxGap);
      this.nextSpawnAt = time + gap;
    }

    // Move obstacles left
    this.obstacles.getChildren().forEach((o) => {
      const obs = o as Phaser.Physics.Arcade.Sprite;
      obs.x -= (this.speed * delta) / 1000;
      if (obs.x < -200) obs.destroy();
    });
  }

  private tryJump() {
    const onGround = (this.player.body as Phaser.Physics.Arcade.Body).blocked.down;
    if (!onGround) return;

    if (this.isSliding) this.endSlide();

    this.player.setVelocityY(-720);
  }

  private startOrMaintainSlide(time: number) {
    const onGround = (this.player.body as Phaser.Physics.Arcade.Body).blocked.down;
    if (!onGround) return;

    if (!this.isSliding) {
      this.isSliding = true;
      this.slideMinUntil = time + SLIDE_MIN_MS;
      this.setPlayerHitboxSliding();
    }
  }

  private endSlide() {
    this.isSliding = false;
    this.setPlayerHitboxStanding();
  }

  private spawnObstacle() {
    const type = Phaser.Math.Between(0, 1);

    if (type === 0) {
      const hurdle = this.physics.add.sprite(WIDTH + 120, GROUND_Y, "hurdle");
      hurdle.setOrigin(0.5, 1);
      hurdle.body.setSize(72, 62, true);
      hurdle.body.setOffset(4, 6);
      hurdle.setImmovable(true);
      hurdle.body.allowGravity = false;
      this.obstacles.add(hurdle);
    } else {
      const barBottomY = GROUND_Y - 105;
      const bar = this.physics.add.sprite(WIDTH + 120, barBottomY, "bar");
      bar.setOrigin(0.5, 1);
      bar.body.setSize(130, 26, true);
      bar.body.setOffset(5, 4);
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
      .text(WIDTH / 2, HEIGHT / 2 - 40, "AMEN.", {
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

    // Player
    g.fillStyle(0xf5e6b3, 1);
    g.fillRoundedRect(0, 0, 90, 120, 18);
    g.lineStyle(4, 0x8a6b3a, 1);
    g.strokeRoundedRect(0, 0, 90, 120, 18);
    g.generateTexture("player", 90, 120);
    g.clear();

    // Hurdle
    g.fillStyle(0xffaa33, 1);
    g.fillRect(0, 0, 80, 70);
    g.lineStyle(4, 0x6b3d00, 1);
    g.strokeRect(0, 0, 80, 70);
    g.generateTexture("hurdle", 80, 70);
    g.clear();

    // Bar
    g.fillStyle(0x66ccff, 1);
    g.fillRect(0, 0, 140, 34);
    g.lineStyle(4, 0x003f55, 1);
    g.strokeRect(0, 0, 140, 34);
    g.generateTexture("bar", 140, 34);

    g.destroy();
  }

  private setPlayerHitboxStanding() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(70, 110, true);
    body.setOffset((90 - 70) / 2, 120 - 110);
    this.player.clearTint();
  }

  private setPlayerHitboxSliding() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(85, 55, true);
    body.setOffset((90 - 85) / 2, 120 - 55);
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
