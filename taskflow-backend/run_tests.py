import os
import subprocess
import sys
from datetime import datetime

def delete_old_reports(reports_dir: str) -> None:
    """Clear out any previous HTML files to keep the directory pristine."""
    if not os.path.exists(reports_dir):
        return
    for filename in os.listdir(reports_dir):
        if filename.endswith(".html"):
            try:
                os.remove(os.path.join(reports_dir, filename))
            except OSError:
                pass

def build_dashboard_html(summary_file: str, timestamp: str, test_results: list) -> None:
    """Generates a clean, central dashboard linking to individual script reports."""
    total_suites = len(test_results)
    failed_suites = sum(1 for r in test_results if "FAILED" in r["status"])
    passed_suites = total_suites - failed_suites

    html_content = f"""<!DOCTYPE html>
    <html>
    <head>
        <title>Test Execution Dashboard</title>
        <style>
            body {{ font-family: 'Segoe UI', sans-serif; background-color: #f8f9fa; margin: 40px; color: #333; }}
            h1 {{ color: #2c3e50; border-bottom: 2px solid #ecf0f1; padding-bottom: 10px; }}
            table {{ width: 100%; border-collapse: collapse; background: white; margin-top: 20px; }}
            th, td {{ padding: 12px 20px; text-align: left; border-bottom: 1px solid #f1f2f6; }}
            th {{ background-color: #f1f2f6; color: #2c3e50; }}
            .passed {{ color: #2ecc71; font-weight: bold; }}
            .failed {{ color: #e74c3c; font-weight: bold; }}
            a {{ color: #3498db; text-decoration: none; }}
        </style>
    </head>
    <body>
        <h1>🎯 Test Execution Dashboard</h1>
        <p>Executed at: <strong>{timestamp}</strong></p>
        <div>
            <strong>Total:</strong> {total_suites} | 
            <span class="passed">Passed: {passed_suites}</span> | 
            <span class="failed">Failed: {failed_suites}</span>
        </div>
        <table>
            <thead>
                <tr><th>Type</th><th>Test Script</th><th>Status</th><th>Report</th></tr>
            </thead>
            <tbody>
    """
    for r in test_results:
        status_class = "passed" if "PASSED" in r["status"] else "failed"
        html_content += f"""
                <tr>
                    <td><code>{r['suite']}</code></td>
                    <td>{r['script']}</td>
                    <td class="{status_class}">{r['status']}</td>
                    <td><a href="{r['report_file']}" target="_blank">View Report ↗</a></td>
                </tr>"""
    html_content += "</tbody></table></body></html>"
    
    with open(summary_file, "w", encoding="utf-8") as f:
        f.write(html_content)

def run_suite() -> None:
    reports_dir = "reports"
    os.makedirs(reports_dir, exist_ok=True)
    delete_old_reports(reports_dir)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    test_results = []
    
    # Inject current directory into PYTHONPATH so execution paths never break
    env = os.environ.copy()
    env["PYTHONPATH"] = os.getcwd()
    
    for test_type in ["unit", "integration"]:
        target_dir = os.path.join("tests", test_type)
        if not os.path.exists(target_dir):
            continue
            
        for root, _, files in os.walk(target_dir):
            for file in files:
                if file.startswith("test_") and file.endswith(".py"):
                    script_path = os.path.join(root, file)
                    script_clean_name = file.replace(".py", "")
                    
                    # Naming requirement: suite_testscript_timestamp.html
                    report_filename = f"{test_type}_{script_clean_name}_{timestamp}.html"
                    report_path = os.path.join(reports_dir, report_filename)
                    
                    print(f"🏃 Running {test_type.upper()}: {script_clean_name}")
                    
                    cmd = f'python -m pytest "{script_path}" --html="{report_path}" --self-contained-html'
                    
                    # Run with the custom environment injected
                    process = subprocess.run(cmd, shell=True, check=False, env=env)
                    status_msg = "✅ PASSED" if process.returncode == 0 else "❌ FAILED"
                    
                    test_results.append({
                        "suite": test_type.capitalize(),
                        "script": script_clean_name,
                        "status": status_msg,
                        "report_file": report_filename
                    })

    dashboard_file = os.path.join(reports_dir, f"dashboard_{timestamp}.html")
    build_dashboard_html(dashboard_file, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), test_results)
    print(f"\n🎉 Finished! Dashboard built at: {dashboard_file}")

if __name__ == "__main__":
    run_suite()