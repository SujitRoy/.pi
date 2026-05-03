/**
 * Funny Working Message Extension 
 *
 * Replaces the built-in "Working..." label shown next to the spinner while PI
 * is streaming. Enhanced with Claude Code-style thinking words and additional
 * funny phrases.
 */

import type { ExtensionAPI, ExtensionContext, AgentStartEvent, AgentEndEvent } from "@mariozechner/pi-coding-agent";

const DEBUG_FORCE_MESSAGE: string | undefined = undefined;

// Combined list: Original cooking/funny words + Claude Code thinking words + Additional funny phrases
const WORDS = [
	// Claude Code thinking words (partial list from what we could extract)
	"Accomplishing... (esc to interrupt)",
	"Actioning... (esc to interrupt)",
	"Actualizing... (esc to interrupt)",
	"Baking... (esc to interrupt)",
	"Brewing... (esc to interrupt)",
	"Calculating... (esc to interrupt)",
	"Cerebrating... (esc to interrupt)",
	"Churning... (esc to interrupt)",
	"Clauding... (esc to interrupt)",
	"Coalescing... (esc to interrupt)",
	"Cogitating... (esc to interrupt)",
	"Computing... (esc to interrupt)",
	"Conjuring... (esc to interrupt)",
	"Considering... (esc to interrupt)",
	"Contemplating... (esc to interrupt)",
	"Coordinating... (esc to interrupt)",
	"Crafting... (esc to interrupt)",
	"Creating... (esc to interrupt)",
	"Crystallizing... (esc to interrupt)",
	"Decoding... (esc to interrupt)",
	"Deconstructing... (esc to interrupt)",
	"Deducing... (esc to interrupt)",
	"Designing... (esc to interrupt)",
	"Developing... (esc to interrupt)",
	"Devising... (esc to interrupt)",
	"Diagramming... (esc to interrupt)",
	"Discovering... (esc to interrupt)",
	"Distilling... (esc to interrupt)",
	"Drafting... (esc to interrupt)",
	"Dreaming... (esc to interrupt)",
	"Elaborating... (esc to interrupt)",
	"Eliciting... (esc to interrupt)",
	"Envisioning... (esc to interrupt)",
	"Evaluating... (esc to interrupt)",
	"Evolving... (esc to interrupt)",
	"Exploring... (esc to interrupt)",
	"Fabricating... (esc to interrupt)",
	"Figuring... (esc to interrupt)",
	"Formulating... (esc to interrupt)",
	"Fostering... (esc to interrupt)",
	"Generating... (esc to interrupt)",
	"Growing... (esc to interrupt)",
	"Guessing... (esc to interrupt)",
	"Hatching... (esc to interrupt)",
	"Honing... (esc to interrupt)",
	"Ideating... (esc to interrupt)",
	"Illuminating... (esc to interrupt)",
	"Imagining... (esc to interrupt)",
	"Incubating... (esc to interrupt)",
	"Inferring... (esc to interrupt)",
	"Innovating... (esc to interrupt)",
	"Inspecting... (esc to interrupt)",
	"Inspiring... (esc to interrupt)",
	"Integrating... (esc to interrupt)",
	"Inventing... (esc to interrupt)",
	"Iterating... (esc to interrupt)",
	"Juicing... (esc to interrupt)",
	"Knitting... (esc to interrupt)",
	"Learning... (esc to interrupt)",
	"Leveraging... (esc to interrupt)",
	"Mapping... (esc to interrupt)",
	"Meditating... (esc to interrupt)",
	"Melding... (esc to interrupt)",
	"Modeling... (esc to interrupt)",
	"Modifying... (esc to interrupt)",
	"Mulling... (esc to interrupt)",
	"Navigating... (esc to interrupt)",
	"Orchestrating... (esc to interrupt)",
	"Organizing... (esc to interrupt)",
	"Originating... (esc to interrupt)",
	"Perceiving... (esc to interrupt)",
	"Performing... (esc to interrupt)",
	"Perspiring... (esc to interrupt)",
	"Planning... (esc to interrupt)",
	"Pondering... (esc to interrupt)",
	"Preparing... (esc to interrupt)",
	"Producing... (esc to interrupt)",
	"Projecting... (esc to interrupt)",
	"Prototyping... (esc to interrupt)",
	"Puzzling... (esc to interrupt)",
	"Questioning... (esc to interrupt)",
	"Reasoning... (esc to interrupt)",
	"Recalling... (esc to interrupt)",
	"Recognizing... (esc to interrupt)",
	"Reconciling... (esc to interrupt)",
	"Refining... (esc to interrupt)",
	"Reflecting... (esc to interrupt)",
	"Reimagining... (esc to interrupt)",
	"Rendering... (esc to interrupt)",
	"Researching... (esc to interrupt)",
	"Resolving... (esc to interrupt)",
	"Rethinking... (esc to interrupt)",
	"Reviewing... (esc to interrupt)",
	"Revising... (esc to interrupt)",
	"Scheming... (esc to interrupt)",
	"Searching... (esc to interrupt)",
	"Seeing... (esc to interrupt)",
	"Selecting... (esc to interrupt)",
	"Shaping... (esc to interrupt)",
	"Sketching... (esc to interrupt)",
	"Solving... (esc to interrupt)",
	"Speculating... (esc to interrupt)",
	"Stimulating... (esc to interrupt)",
	"Strategizing... (esc to interrupt)",
	"Studying... (esc to interrupt)",
	"Suggesting... (esc to interrupt)",
	"Summarizing... (esc to interrupt)",
	"Surmising... (esc to interrupt)",
	"Synthesizing... (esc to interrupt)",
	"Systematizing... (esc to interrupt)",
	"Testing... (esc to interrupt)",
	"Theorizing... (esc to interrupt)",
	"Thinking... (esc to interrupt)",
	"Transforming... (esc to interrupt)",
	"Translating... (esc to interrupt)",
	"Uncovering... (esc to interrupt)",
	"Understanding... (esc to interrupt)",
	"Unfolding... (esc to interrupt)",
	"Unraveling... (esc to interrupt)",
	"Unveiling... (esc to interrupt)",
	"Visualizing... (esc to interrupt)",
	"Wandering... (esc to interrupt)",
	"Weaving... (esc to interrupt)",
	"Weighing... (esc to interrupt)",
	"Wondering... (esc to interrupt)",
	"Working... (esc to interrupt)",
	"Writing... (esc to interrupt)",
	
	// Original cooking/funny words from the extension
	"Simmering... (esc to interrupt)",
	"Julienning... (esc to interrupt)",
	"Shimmering... (esc to interrupt)",
	"Braising... (esc to interrupt)",
	"Reducing... (esc to interrupt)",
	"Caramelizing... (esc to interrupt)",
	"Whisking... (esc to interrupt)",
	"Deglazing... (esc to interrupt)",
	"Proofing... (esc to interrupt)",
	"Kneading... (esc to interrupt)",
	"Plating... (esc to interrupt)",
	"Garnishing... (esc to interrupt)",
	"Seasoning... (esc to interrupt)",
	"Grinding pepper... (esc to interrupt)",
	"Zesting... (esc to interrupt)",
	"Chiffonading... (esc to interrupt)",
	"Mise en placing... (esc to interrupt)",
	"Sauce whispering... (esc to interrupt)",
	"Fondanting... (esc to interrupt)",
	"Emulsifying... (esc to interrupt)",
	"Clarifying butter... (esc to interrupt)",
	"Toasting spices... (esc to interrupt)",
	"Blooming gelatin... (esc to interrupt)",
	"Tempering chocolate... (esc to interrupt)",
	"Folding gently... (esc to interrupt)",
	"Sifting... (esc to interrupt)",
	"Preheating... (esc to interrupt)",
	"Basting... (esc to interrupt)",
	"Resting dough... (esc to interrupt)",
	"Resting the roast... (esc to interrupt)",
	"Crisping edges... (esc to interrupt)",
	"Rendering fat... (esc to interrupt)",
	"Glazing... (esc to interrupt)",
	"Torching... (esc to interrupt)",
	"Blanching... (esc to interrupt)",
	"Shocking... (esc to interrupt)",
	"Finishing with a squeeze of lemon... (esc to interrupt)",
	
	// Additional funny/tech phrases
	"Counting microseconds... (esc to interrupt)",
	"Indexing neurons... (esc to interrupt)",
	"Compiling vibes... (esc to interrupt)",
	"Refactoring reality... (esc to interrupt)",
	"Reticulating splines... (esc to interrupt)",
	"Tightening feedback loops... (esc to interrupt)",
	"Calibrating taste buds... (esc to interrupt)",
	"Stirring the semantic soup... (esc to interrupt)",
	"Resolving dependencies... (esc to interrupt)",
	"Aligning parentheses... (esc to interrupt)",
	"Normalizing whitespace... (esc to interrupt)",
	"Polishing edge cases... (esc to interrupt)",
	"Negotiating with entropy... (esc to interrupt)",
	"Petting the garbage collector... (esc to interrupt)",
	"Waking up the type checker... (esc to interrupt)",
	"Summoning documentation... (esc to interrupt)",
	"Searching for the missing semicolon... (esc to interrupt)",
	"Assembling breadcrumbs... (esc to interrupt)",
	"Rolling back time... (esc to interrupt)",
	"Spinning up tiny hamsters... (esc to interrupt)",
	"Charging the flux capacitor... (esc to interrupt)",
	"Tuning the banjo of truth... (esc to interrupt)",
	"Consulting the rubber duck... (esc to interrupt)",
	"Offering snacks to the linter... (esc to interrupt)",
	"Negotiating with the CI... (esc to interrupt)",
	"Herding bytes... (esc to interrupt)",
	"Routing packets politely... (esc to interrupt)",
	"Untangling spaghetti... (esc to interrupt)",
	"Converting coffee to code... (esc to interrupt)",
	"Decompressing thoughts... (esc to interrupt)",
	"Spooling wisdom... (esc to interrupt)",
	"Focusing the laser pointer... (esc to interrupt)",
	"Weighing trade-offs... (esc to interrupt)",
	"Sanding rough edges... (esc to interrupt)",
	"Measuring twice, cutting once... (esc to interrupt)",
	"Counting to infinity... (esc to interrupt)",
	"Almost done™... (esc to interrupt)",
	"Doing it live... (esc to interrupt)",
	"Spinning in place... (esc to interrupt)",
	"Casting spells... (esc to interrupt)",
	"Whispering to sockets... (esc to interrupt)",
	"Hugging the cache... (esc to interrupt)",
	"Rehearsing apologies to future me... (esc to interrupt)",
	"Planting TODOs... (esc to interrupt)",
	"Harvesting TODOs... (esc to interrupt)",
	"Stacking brackets... (esc to interrupt)",
	"Leveling up the logs... (esc to interrupt)",
	"Subdividing dragons... (esc to interrupt)",
	"Warming up the electrons... (esc to interrupt)",
	"Squeezing latency... (esc to interrupt)",
	"Shaving yaks... (esc to interrupt)",
	"Appeasing the build gods... (esc to interrupt)",
	"Nudging bits into place... (esc to interrupt)",
	"Greasing the gears... (esc to interrupt)",
	"Summarizing the unsummarizable... (esc to interrupt)",
	"Drafting a tiny masterpiece... (esc to interrupt)",
	"Checking the map, not the territory... (esc to interrupt)",
	"Spinning up hypotheses... (esc to interrupt)",
	"Chasing the last 1%... (esc to interrupt)",
	"Hunting heisenbugs... (esc to interrupt)",
	"Crossing the streams... (esc to interrupt)",
	"Aligning chakras (and tabs)... (esc to interrupt)",
	"Buffering... (esc to interrupt)",
	"Unbuffering... (esc to interrupt)",
	"Rebuffering... (esc to interrupt)",
	"Transpiling punchlines... (esc to interrupt)",
	"Sharpening pencils... (esc to interrupt)",
	"Sharpening knives (metaphorically)... (esc to interrupt)",
	
	// More Claude-style and programming humor
	"Debugging the universe... (esc to interrupt)",
	"Parsing consciousness... (esc to interrupt)",
	"Compiling thoughts... (esc to interrupt)",
	"Optimizing happiness... (esc to interrupt)",
	"Refactoring dreams... (esc to interrupt)",
	"Running unit tests on reality... (esc to interrupt)",
	"Loading inspiration... (esc to interrupt)",
	"Bootstrapping creativity... (esc to interrupt)",
	"Initializing genius... (esc to interrupt)",
	"Compressing ideas... (esc to interrupt)",
	"Deploying solutions... (esc to interrupt)",
	"Version controlling thoughts... (esc to interrupt)",
	"Containerizing concepts... (esc to interrupt)",
	"Orchestrating brilliance... (esc to interrupt)",
	"Scaling wisdom... (esc to interrupt)",
	"Benchmarking imagination... (esc to interrupt)",
	"Profiling intuition... (esc to interrupt)",
	"Caching insights... (esc to interrupt)",
	"Indexing knowledge... (esc to interrupt)",
	"Querying the cosmos... (esc to interrupt)",
	"Joining dots... (esc to interrupt)",
	"Transactionally thinking... (esc to interrupt)",
	"Rolling forward ideas... (esc to interrupt)",
	"Committing to brilliance... (esc to interrupt)",
	"Pushing to production... (esc to interrupt)",
	"Pulling inspiration... (esc to interrupt)",
	"Merging concepts... (esc to interrupt)",
	"Rebasing understanding... (esc to interrupt)",
	"Forking reality... (esc to interrupt)",
	"Branching possibilities... (esc to interrupt)",
	"Cloning genius... (esc to interrupt)",
	"Stashing distractions... (esc to interrupt)",
	"Cherry-picking insights... (esc to interrupt)",
	"Squashing bugs (and doubts)... (esc to interrupt)",
];

function pickWord(): string {
	if (DEBUG_FORCE_MESSAGE) return DEBUG_FORCE_MESSAGE;
	return WORDS[Math.floor(Math.random() * WORDS.length)] ?? "Working... (esc to interrupt)";
}

export default function (pi: ExtensionAPI) {
  try {
	let enabled = true; // Auto-enable by default
	let rotationInterval: ReturnType<typeof setInterval> | null = null;
	let currentAgentActive = false;

	function startRotation(ctx: ExtensionContext) {
		if (rotationInterval) {
			clearInterval(rotationInterval);
		}
		
		// Update immediately
		const msg = pickWord();
		ctx.ui.setWorkingMessage(msg);
		
		// Set up rotation every 5 seconds (5000ms)
		rotationInterval = setInterval(() => {
			if (currentAgentActive && enabled && ctx.hasUI) {
				const newMsg = pickWord();
				ctx.ui.setWorkingMessage(newMsg);
			}
		}, 5000);
	}

	function stopRotation() {
		if (rotationInterval) {
			clearInterval(rotationInterval);
			rotationInterval = null;
		}
	}

	pi.registerCommand("fun-working", {
		description: "Toggle funny working message next to spinner",
		handler: async (_args: string, ctx: ExtensionContext) => {
			enabled = !enabled;
			if (!enabled) {
				stopRotation();
				ctx.ui.setWorkingMessage();
				ctx.ui.notify("Restored default working message", "info");
				return;
			}

			// If we toggle while the agent is already streaming, apply immediately.
			if (!ctx.isIdle()) {
				currentAgentActive = true;
				startRotation(ctx);
			}
			ctx.ui.notify("Funny working message enabled", "info");
		},
	});

	// Initialize on session start (funny messages auto-enabled by default)
	pi.on("session_start", async (_event, ctx: ExtensionContext) => {
		// Already enabled by default, no notification needed
	});

	pi.on("agent_start", async (_event: AgentStartEvent, ctx: ExtensionContext) => {
		if (!enabled) return;
		if (!ctx.hasUI) return;
		currentAgentActive = true;
		startRotation(ctx);
	});

	pi.on("agent_end", async (_event: AgentEndEvent, ctx: ExtensionContext) => {
		if (!enabled) return;
		if (!ctx.hasUI) return;
		currentAgentActive = false;
		stopRotation();
		ctx.ui.setWorkingMessage();
	});

	// Clean up on session shutdown
	pi.on("session_shutdown", async () => {
		stopRotation();
	});
  } catch (error) {
    console.error('[funny-working-message] Extension failed to load:', error);
  }
}
