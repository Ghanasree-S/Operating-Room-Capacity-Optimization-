import sys
from pathlib import Path

# Source modules use flat imports (e.g. `import data_prep`), so put src/ on the path.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
